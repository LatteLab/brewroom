'use server';

import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';
import {
  createEvent as dbCreateEvent,
  updateEvent as dbUpdateEvent,
  deleteEvent as dbDeleteEvent,
  getEventById,
  createRegistration,
  deleteRegistration,
  getUserRegistration,
  getRegistrationCount,
  getEventRegistrations,
  computePriorityScore,
  upsertLotteryHistoryEntries,
  getEventLotteryParticipantIds,
  updateRegistration,
  bulkMarkNoShow,
  getEventByInviteCode,
  createEventAccess,
  hasEventAccess,
  getCurrentSemesterLabel,
  getUserEventHistory,
  getUserLotteryStats,
  getUserNoShowCount,
  createAuditLogEntry,
  createAuditLogEntries,
  getRegistrationAuditLog as dbGetRegistrationAuditLog,
  deleteLotteryWins,
  createRegistrationWithCapacityCheck,
  claimLotteryDraftSlot,
  getOutgoingInvite,
  getIncomingInvite,
  getPlusOneInviteById,
  getAcceptedPairingsForEvent,
  getAllEventInvites,
  createPlusOneInvite,
  updatePlusOneInviteStatus,
  deletePlusOneInvite,
  createEventEditLogEntry,
  getEventEditLog as dbGetEventEditLog,
  getWaitlistPosition,
  seedDefaultReminderRule,
  getEventPhotos as dbGetEventPhotos,
  getEventPhotoById,
  createEventPhotos,
  deleteEventPhoto as dbDeleteEventPhoto,
  updateEventPhotoCaption as dbUpdateEventPhotoCaption,
} from '@/lib/db/event-queries';
import { getUserById } from '@/lib/db/queries';
import { createEventSchema, updateEventSchema } from '@/lib/validations/events';
import { weightedSelectWithSeats, buildLotteryPool } from '@/lib/utils/lottery';
import {
  createEventPhotoUploadTickets,
  deleteEventPhotoObject,
  getEventPhotoPublicUrl,
  type UploadTicket,
  type UploadTicketRequest,
} from '@/lib/supabase/server-storage';
import { sendTransactional } from '@/lib/emails/send';
import { buildEventSummary } from '@/lib/emails/templates';
import {
  notifyEventCancelledRegistrants,
  notifyEventChangedRegistrants,
  notifyLotteryResults,
  notifyPhotoAlbumAvailable,
  notifyRegistrationApproved,
  notifyRegistrationRejected,
  notifyWaitlistPromoted,
  resendRegistrationConfirmations,
} from '@/lib/emails/event-notifications';
import type { Event } from '@/lib/db/schema';

function assertLotteryEventCanMutate(event: Event) {
  if (event.status === 'completed' || event.status === 'cancelled') {
    throw new Error('Lottery cannot be changed for completed or cancelled events');
  }
}

export async function createEventAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const raw = Object.fromEntries(formData);
  const parsed = createEventSchema.parse({
    ...raw,
    capacity: Number(raw.capacity),
    requireApproval: raw.requireApproval === 'true',
    waitlistEnabled: raw.waitlistEnabled === 'true',
    plusOneEnabled: raw.plusOneEnabled === 'true',
    showAttendeesPreRegistration: raw.showAttendeesPreRegistration !== 'false',
  });
  const questions = raw.questions ? JSON.parse(raw.questions as string) : null;
  const timezone = raw.timezone as string;

  // Auto-generate invite code for private events
  const inviteCode = parsed.visibility === 'private'
    ? Buffer.from(crypto.getRandomValues(new Uint8Array(12))).toString('base64url')
    : null;

  const event = await dbCreateEvent({
    ...parsed,
    coverImage: parsed.coverImage || null,
    description: parsed.description || null,
    location: parsed.location || null,
    endDate: parsed.endDate || null,
    questions: questions || null,
    timezone,
    inviteCode,
    status: 'open',
    createdBy: session.user.id,
  });

  // Seed the default 24h reminder. Admins can disable from the event form later.
  await seedDefaultReminderRule(event.id);

  revalidatePath('/admin/events');
  revalidatePath('/user/events');
  return event;
}

export async function updateEventAction(eventId: string, formData: FormData) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const raw = Object.fromEntries(formData);
  const parsed = updateEventSchema.parse({
    ...raw,
    capacity: raw.capacity ? Number(raw.capacity) : undefined,
    waitlistEnabled: raw.waitlistEnabled !== undefined ? raw.waitlistEnabled === 'true' : undefined,
    plusOneEnabled: raw.plusOneEnabled !== undefined ? raw.plusOneEnabled === 'true' : undefined,
    showAttendeesPreRegistration: raw.showAttendeesPreRegistration !== undefined ? raw.showAttendeesPreRegistration !== 'false' : undefined,
  });
  const questions = raw.questions !== undefined ? (raw.questions ? JSON.parse(raw.questions as string) : null) : undefined;
  const timezone = raw.timezone as string | undefined;

  // Fetch old event for changelog diff + invite code logic
  const oldEvent = await getEventById(eventId);

  // Handle invite code when visibility changes
  let inviteCode: string | null | undefined;
  if (parsed.visibility === 'private') {
    if (!oldEvent?.inviteCode) {
      inviteCode = Buffer.from(crypto.getRandomValues(new Uint8Array(12))).toString('base64url');
    }
  }

  const event = await dbUpdateEvent(eventId, {
    ...parsed,
    coverImage: parsed.coverImage || null,
    description: parsed.description || null,
    location: parsed.location || null,
    endDate: parsed.endDate || null,
    ...(questions !== undefined && { questions }),
    ...(inviteCode !== undefined && { inviteCode }),
    ...(timezone && { timezone }),
  });

  // Log changed fields
  if (oldEvent) {
    const trackedFields = ['name', 'description', 'date', 'endDate', 'location', 'capacity', 'visibility', 'status', 'requireApproval', 'waitlistEnabled', 'plusOneEnabled', 'showAttendeesPreRegistration'] as const;
    const changes: Record<string, { old: unknown; new: unknown }> = {};
    for (const field of trackedFields) {
      if (JSON.stringify(oldEvent[field]) !== JSON.stringify(event[field])) {
        changes[field] = { old: oldEvent[field], new: event[field] };
      }
    }
    if (Object.keys(changes).length > 0) {
      await createEventEditLogEntry({ eventId, changedBy: session.user.id, changes });
    }

    // Notify-on-change is opt-in: admin checks "Notify registrants" + at least one of the
    // notify-worthy fields (date / endDate / location) actually changed.
    const notifyRegistrants = raw.notifyRegistrants === 'true';
    const notifyFields: (keyof typeof changes)[] = ['date', 'endDate', 'location'];
    const notifyChanges = notifyFields.filter(f => changes[f]);
    if (notifyRegistrants && notifyChanges.length > 0) {
      const regs = await getEventRegistrations(eventId);
      const confirmed = regs.filter(r =>
        ['registered', 'selected', 'checked_in'].includes(r.registration.status) && r.user.email,
      );
      if (confirmed.length > 0) {
        const changePayload = Object.fromEntries(
          notifyChanges.map((field) => [field, changes[field]]),
        ) as Partial<Record<keyof Event, { old: unknown; new: unknown }>>;
        await notifyEventChangedRegistrants(event, confirmed, changePayload);
      }
    }
  }

  revalidatePath('/admin/events');
  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath('/user/events');
  return event;
}

export async function getEventEditLogAction(eventId: string) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');
  return dbGetEventEditLog(eventId);
}

export async function duplicateEventAction(eventId: string) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const original = await getEventById(eventId);
  if (!original) throw new Error('Event not found');

  const inviteCode = original.visibility === 'private'
    ? Buffer.from(crypto.getRandomValues(new Uint8Array(12))).toString('base64url')
    : null;

  const copy = await dbCreateEvent({
    name: `${original.name} (Copy)`,
    description: original.description,
    coverImage: original.coverImage,
    date: original.date,
    endDate: original.endDate,
    location: original.location,
    capacity: original.capacity,
    visibility: original.visibility,
    waitlistEnabled: original.waitlistEnabled,
    plusOneEnabled: original.plusOneEnabled,
    requireApproval: original.requireApproval,
    showAttendeesPreRegistration: original.showAttendeesPreRegistration,
    questions: original.questions,
    status: 'open',
    lotteryStatus: null,
    inviteCode,
    createdBy: session.user.id,
  });

  await seedDefaultReminderRule(copy.id);

  revalidatePath('/admin/events');
  return copy;
}

export async function registerForEvent(eventId: string, questionnaireAnswers?: Record<string, string | boolean>) {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');

  const event = await getEventById(eventId);
  if (!event || event.status !== 'open') {
    throw new Error('Event not available for registration');
  }

  // For private events, verify user has access
  if (event.visibility === 'private') {
    const access = await hasEventAccess(session.user.id, eventId);
    if (!access) throw new Error('You do not have access to this event');
  }

  const existing = await getUserRegistration(session.user.id, eventId);
  if (existing) throw new Error('Already registered');

  const answers = questionnaireAnswers && Object.keys(questionnaireAnswers).length > 0
    ? questionnaireAnswers
    : null;

  const eventSummary = buildEventSummary(event);
  const userName = session.user.name ?? null;
  const recipient = { userId: session.user.id, email: session.user.email!, name: userName };

  // Require approval - always pending_approval
  if (event.requireApproval) {
    const reg = await createRegistration({
      userId: session.user.id,
      eventId,
      status: 'pending_approval',
      questionnaireAnswers: answers,
    });
    await createAuditLogEntry({
      registrationId: reg.id,
      eventId,
      userId: session.user.id,
      oldStatus: null,
      newStatus: 'pending_approval',
      action: 'registered',
      actorId: null,
      actorType: 'user',
    });
    await sendTransactional({
      template: 'registration_received',
      recipient,
      payload: { userName, event: eventSummary, requiresApproval: true },
      idempotencyKey: `registration_received:${reg.id}`,
      relatedEventId: eventId,
      relatedRegistrationId: reg.id,
    });
    revalidatePath(`/user/events/${eventId}`);
    revalidatePath(`/admin/events/${eventId}`);
    return;
  }

  // FCFS registration - atomic to prevent over-capacity under concurrent load
  const result = await createRegistrationWithCapacityCheck({
    userId: session.user.id,
    eventId,
    capacity: event.capacity,
    waitlistEnabled: event.waitlistEnabled,
    questionnaireAnswers: answers,
  });

  if (!result) throw new Error('Event is full');

  await createAuditLogEntry({
    registrationId: result.reg.id,
    eventId,
    userId: session.user.id,
    oldStatus: null,
    newStatus: result.wasWaitlisted ? 'waitlisted' : 'registered',
    action: 'registered',
    actorId: null,
    actorType: 'user',
  });

  if (result.wasWaitlisted) {
    const position = await getWaitlistPosition(session.user.id, eventId);
    await sendTransactional({
      template: 'waitlist_joined',
      recipient,
      payload: { userName, event: eventSummary, position },
      idempotencyKey: `waitlist_joined:${result.reg.id}`,
      relatedEventId: eventId,
      relatedRegistrationId: result.reg.id,
    });
  } else {
    await sendTransactional({
      template: 'registration_received',
      recipient,
      payload: { userName, event: eventSummary, requiresApproval: false },
      idempotencyKey: `registration_received:${result.reg.id}`,
      relatedEventId: eventId,
      relatedRegistrationId: result.reg.id,
    });
  }

  revalidatePath(`/user/events/${eventId}`);
  revalidatePath(`/admin/events/${eventId}`);
}

/** Pair-aware waitlist promotion: promotes one or more waitlisted registrations when slots open. */
async function promoteFromWaitlist(eventId: string) {
  const event = await getEventById(eventId);
  if (!event?.waitlistEnabled || event.requireApproval) return;

  const regs = await getEventRegistrations(eventId);
  const waitlisted = regs.filter(r => r.registration.status === 'waitlisted');
  if (waitlisted.length === 0) return;

  const confirmedCount = await getRegistrationCount(eventId, ['registered', 'checked_in']);
  let availableSlots = Math.max(0, event.capacity - confirmedCount);
  if (availableSlots === 0) return;

  const pairings = await getAcceptedPairingsForEvent(eventId);
  // Build a set of waitlisted registration IDs for quick lookup
  const waitlistedRegIds = new Set(waitlisted.map(r => r.registration.id));

  // Build a map: regId -> partnerId (only for pairings where BOTH are waitlisted)
  const bothWaitlistedPartnerMap = new Map<string, string>();
  for (const pairing of pairings) {
    const inviterWaiting = waitlistedRegIds.has(pairing.inviterRegistrationId);
    const inviteeWaiting = waitlistedRegIds.has(pairing.inviteeRegistrationId);
    if (inviterWaiting && inviteeWaiting) {
      bothWaitlistedPartnerMap.set(pairing.inviterRegistrationId, pairing.inviteeRegistrationId);
      bothWaitlistedPartnerMap.set(pairing.inviteeRegistrationId, pairing.inviterRegistrationId);
    }
  }

  const auditEntries: Parameters<typeof createAuditLogEntries>[0] = [];

  // Walk the FIFO waitlist and promote as many as available slots allow
  const promoted = new Set<string>();
  for (const entry of waitlisted) {
    if (availableSlots <= 0) break;
    if (promoted.has(entry.registration.id)) continue;

    const partnerId = bothWaitlistedPartnerMap.get(entry.registration.id);
    if (partnerId) {
      // This person and their partner are both waiting - need 2 slots
      if (availableSlots >= 2) {
        const partnerEntry = waitlisted.find(r => r.registration.id === partnerId)!;
        await updateRegistration(entry.registration.id, { status: 'registered' });
        await updateRegistration(partnerId, { status: 'registered' });
        auditEntries.push(
          { registrationId: entry.registration.id, eventId, userId: entry.user.id, oldStatus: 'waitlisted', newStatus: 'registered', action: 'approved', actorId: null, actorType: 'system' },
          { registrationId: partnerId, eventId, userId: partnerEntry.user.id, oldStatus: 'waitlisted', newStatus: 'registered', action: 'approved', actorId: null, actorType: 'system' },
        );
        promoted.add(entry.registration.id);
        promoted.add(partnerId);
        availableSlots -= 2;
      }
      // else: only 1 slot but pair needs 2 -> skip this pair
    } else {
      // Solo or partner not on waitlist - can take 1 slot
      await updateRegistration(entry.registration.id, { status: 'registered' });
      auditEntries.push({
        registrationId: entry.registration.id, eventId, userId: entry.user.id,
        oldStatus: 'waitlisted', newStatus: 'registered', action: 'approved', actorId: null, actorType: 'system',
      });
      promoted.add(entry.registration.id);
      availableSlots -= 1;
    }
  }

  if (auditEntries.length > 0) {
    await createAuditLogEntries(auditEntries);
  }

  if (promoted.size > 0) {
    const promotedRegs = waitlisted.filter(r => promoted.has(r.registration.id));
    await notifyWaitlistPromoted(event, promotedRegs);
  }
}

export async function cancelRegistration(eventId: string, scope: 'me' | 'both' = 'me') {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');

  // Get the registration before deleting so we can log it
  const existing = await getUserRegistration(session.user.id, eventId);
  if (!existing) throw new Error('Registration not found');

  // If scope=both, find and cancel partner first (before deleting own registration,
  // since cascade delete of the invite would happen when either reg is deleted)
  if (scope === 'both') {
    const outgoing = await getOutgoingInvite(existing.id);
    const incoming = await getIncomingInvite(existing.id);
    const invite = outgoing || incoming;

    if (invite && invite.status === 'accepted') {
      const partnerRegId = invite.inviterRegistrationId === existing.id
        ? invite.inviteeRegistrationId
        : invite.inviterRegistrationId;

      // Fetch partner registration to get userId for audit
      const allRegs = await getEventRegistrations(eventId);
      const partnerReg = allRegs.find(r => r.registration.id === partnerRegId);
      if (partnerReg) {
        // Audit for partner - must be before deleteRegistration (cascade deletes it)
        // Use null registrationId - the registration is about to be deleted
        // and cascade would remove the audit entry with it.
        await createAuditLogEntry({
          registrationId: null,
          eventId,
          userId: partnerReg.user.id,
          oldStatus: partnerReg.registration.status,
          newStatus: 'cancelled',
          action: 'removed',
          actorId: session.user.id,
          actorType: 'user',
        });
        await deleteRegistration(partnerReg.user.id, eventId);
      }
    }
  }

  // Audit own cancellation - use null registrationId so the entry survives
  // cascade delete of the registration.
  await createAuditLogEntry({
    registrationId: null,
    eventId,
    userId: session.user.id,
    oldStatus: existing.status,
    newStatus: 'cancelled',
    action: 'removed',
    actorId: null,
    actorType: 'user',
  });

  await deleteRegistration(session.user.id, eventId);

  // Promote from waitlist, respecting pairs
  await promoteFromWaitlist(eventId);

  revalidatePath(`/user/events/${eventId}`);
  revalidatePath(`/admin/events/${eventId}`);
}

export async function runLotteryDraft(eventId: string) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const event = await getEventById(eventId);
  if (!event || !event.requireApproval) throw new Error('Lottery only available for approval-required events');
  assertLotteryEventCanMutate(event);

  const isRerun = event.lotteryStatus === 'finalized';

  // Atomically claim the draft slot - prevents two admins from running the lottery simultaneously.
  // claimLotteryDraftSlot does UPDATE ... WHERE lottery_status IS NULL OR 'finalized', which is atomic in PostgreSQL.
  const claimed = await claimLotteryDraftSlot(eventId);
  if (!claimed) throw new Error('A lottery draft is already in progress');

  try {
    const regs = await getEventRegistrations(eventId);
    const entrants = regs.filter(r => r.registration.status === 'pending_approval');

    if (entrants.length === 0) {
      // Reset so admins can retry after adding registrations
      await dbUpdateEvent(eventId, { lotteryStatus: isRerun ? 'finalized' : null });
      throw new Error('No eligible registrations');
    }

    const scored = await Promise.all(
      entrants.map(async (entry) => {
        const score = await computePriorityScore(entry.user.id);
        return { ...entry, score };
      })
    );

    const confirmedCount = await getRegistrationCount(eventId, ['registered', 'selected', 'checked_in']);
    const availableSeats = Math.max(0, event.capacity - confirmedCount);

    // Build lottery entries respecting +1 pairs (if feature enabled)
    const pairings = event.plusOneEnabled ? await getAcceptedPairingsForEvent(eventId) : [];
    const entrantRegIds = new Set(entrants.map(e => e.registration.id));
    const pool = buildLotteryPool(scored, pairings, entrantRegIds);
    const selectedEntries = weightedSelectWithSeats(pool, availableSeats);

    // Collect selected registration IDs
    const selectedRegIds = new Set<string>();
    for (const entry of selectedEntries) {
      if (entry.isPair) {
        selectedRegIds.add(entry.inviterReg.registration.id);
        selectedRegIds.add(entry.inviteeReg.registration.id);
      } else {
        selectedRegIds.add(entry.reg.registration.id);
      }
    }

    await Promise.all(
      scored.map(async (entry) => {
        const isSelected = selectedRegIds.has(entry.registration.id);
        await updateRegistration(entry.registration.id, {
          status: isSelected ? 'draft_selected' : 'draft_rejected',
          lotteryPriorityScore: entry.score,
        });
      })
    );

    revalidatePath(`/admin/events/${eventId}`);
    revalidatePath(`/user/events/${eventId}`);

    const selectedScored = scored.filter(s => selectedRegIds.has(s.registration.id));
    const rejectedScored = scored.filter(s => !selectedRegIds.has(s.registration.id));
    return {
      selected: selectedScored.map(s => ({ name: s.user.name, email: s.user.email, score: s.score })),
      rejected: rejectedScored.map(s => ({ name: s.user.name, email: s.user.email, score: s.score })),
    };
  } catch (error) {
    // Reset lotteryStatus and any draft registration statuses so admins can retry.
    const draftRegs = await getEventRegistrations(eventId);
    const draftEntrants = draftRegs.filter(r =>
      r.registration.status === 'draft_selected' || r.registration.status === 'draft_rejected'
    );
    await Promise.all([
      ...draftEntrants.map(r =>
        updateRegistration(r.registration.id, {
          status: 'pending_approval',
          lotteryPriorityScore: null,
        })
      ),
      dbUpdateEvent(eventId, { lotteryStatus: isRerun ? 'finalized' : null }),
    ]);
    throw error;
  }
}

export async function removeDraftSelected(registrationId: string, eventId: string) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const event = await getEventById(eventId);
  if (!event || event.lotteryStatus !== 'draft') throw new Error('No lottery draft in progress');
  assertLotteryEventCanMutate(event);

  const regs = await getEventRegistrations(eventId);
  const reg = regs.find(r => r.registration.id === registrationId);
  if (!reg || reg.registration.status !== 'draft_selected') {
    throw new Error('Registration is not draft selected');
  }

  await updateRegistration(registrationId, { status: 'draft_rejected' });

  // If this registration is part of an accepted pair, also remove the partner
  if (event.plusOneEnabled) {
    const outgoing = await getOutgoingInvite(registrationId);
    const incoming = await getIncomingInvite(registrationId);
    const invite = outgoing || incoming;
    if (invite && invite.status === 'accepted') {
      const partnerRegId = invite.inviterRegistrationId === registrationId
        ? invite.inviteeRegistrationId
        : invite.inviterRegistrationId;
      const partnerReg = regs.find(r => r.registration.id === partnerRegId);
      if (partnerReg?.registration.status === 'draft_selected') {
        await updateRegistration(partnerRegId, { status: 'draft_rejected' });
      }
    }
  }

  revalidatePath(`/admin/events/${eventId}`);
}

export async function promoteDraftRejected(registrationId: string, eventId: string) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const event = await getEventById(eventId);
  if (!event || event.lotteryStatus !== 'draft') throw new Error('No lottery draft in progress');
  assertLotteryEventCanMutate(event);

  const regs = await getEventRegistrations(eventId);
  const reg = regs.find(r => r.registration.id === registrationId);
  if (!reg || reg.registration.status !== 'draft_rejected') {
    throw new Error('Registration is not draft rejected');
  }

  const draftSelectedCount = regs.filter(r => r.registration.status === 'draft_selected').length;
  const confirmedCount = await getRegistrationCount(eventId, ['registered', 'selected', 'checked_in']);
  const openSlots = Math.max(0, event.capacity - confirmedCount - draftSelectedCount);

  // Check if this registration is part of an accepted pair (both must be draft_rejected)
  let partnerRegId: string | null = null;
  if (event.plusOneEnabled) {
    const outgoing = await getOutgoingInvite(registrationId);
    const incoming = await getIncomingInvite(registrationId);
    const invite = outgoing || incoming;
    if (invite && invite.status === 'accepted') {
      const candidatePartnerId = invite.inviterRegistrationId === registrationId
        ? invite.inviteeRegistrationId
        : invite.inviterRegistrationId;
      const partnerReg = regs.find(r => r.registration.id === candidatePartnerId);
      if (partnerReg?.registration.status === 'draft_rejected') {
        partnerRegId = candidatePartnerId;
      }
    }
  }

  const slotsNeeded = partnerRegId ? 2 : 1;
  if (openSlots < slotsNeeded) {
    throw new Error(partnerRegId
      ? 'Promoting this pair requires 2 open slots'
      : 'No open slots available'
    );
  }

  await updateRegistration(registrationId, { status: 'draft_selected' });
  if (partnerRegId) {
    await updateRegistration(partnerRegId, { status: 'draft_selected' });
  }
  revalidatePath(`/admin/events/${eventId}`);
}

export async function rerollLottery(eventId: string) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const event = await getEventById(eventId);
  if (!event || event.lotteryStatus !== 'draft') throw new Error('No lottery draft in progress');
  assertLotteryEventCanMutate(event);

  const regs = await getEventRegistrations(eventId);
  const draftSelected = regs.filter(r => r.registration.status === 'draft_selected');
  const draftRejected = regs.filter(r => r.registration.status === 'draft_rejected');

  const confirmedCount = await getRegistrationCount(eventId, ['registered', 'selected', 'checked_in']);
  const totalSlots = Math.max(0, event.capacity - confirmedCount);
  const openSlots = totalSlots - draftSelected.length;

  if (openSlots <= 0 || draftRejected.length === 0) {
    return { newlySelected: [], remainingRejected: draftRejected.length, noOpenSlots: true };
  }

  const scored = await Promise.all(
    draftRejected.map(async (entry) => {
      const score = entry.registration.lotteryPriorityScore ?? await computePriorityScore(entry.user.id);
      return { ...entry, score };
    })
  );

  // Build pair-aware lottery entries for the re-roll
  const pairings = event.plusOneEnabled ? await getAcceptedPairingsForEvent(eventId) : [];
  const rejectedRegIds = new Set(draftRejected.map(r => r.registration.id));
  const pool = buildLotteryPool(scored, pairings, rejectedRegIds);
  const newSelectedEntries = weightedSelectWithSeats(pool, openSlots);

  const newSelectedRegIds = new Set<string>();
  for (const entry of newSelectedEntries) {
    if (entry.isPair) {
      newSelectedRegIds.add(entry.inviterReg.registration.id);
      newSelectedRegIds.add(entry.inviteeReg.registration.id);
    } else {
      newSelectedRegIds.add(entry.reg.registration.id);
    }
  }

  await Promise.all(
    scored
      .filter(e => newSelectedRegIds.has(e.registration.id))
      .map(entry => updateRegistration(entry.registration.id, { status: 'draft_selected' }))
  );

  revalidatePath(`/admin/events/${eventId}`);

  const newlySelected = scored.filter(s => newSelectedRegIds.has(s.registration.id));
  return {
    newlySelected: newlySelected.map(s => ({ name: s.user.name, email: s.user.email, score: s.score })),
    remainingRejected: scored.filter(s => !newSelectedRegIds.has(s.registration.id)).length,
    noOpenSlots: false,
  };
}

export async function finalizeLottery(eventId: string) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const event = await getEventById(eventId);
  if (!event || event.lotteryStatus !== 'draft') throw new Error('No lottery draft in progress');
  assertLotteryEventCanMutate(event);

  const regs = await getEventRegistrations(eventId);
  const draftSelected = regs.filter(r => r.registration.status === 'draft_selected');
  const draftRejected = regs.filter(r => r.registration.status === 'draft_rejected');

  await Promise.all([
    ...draftSelected.map(r => updateRegistration(r.registration.id, { status: 'selected' })),
    ...draftRejected.map(r => updateRegistration(r.registration.id, { status: 'pending_approval' })),
  ]);

  const semesterLabel = await getCurrentSemesterLabel();
  const historyEntries = [
    ...draftSelected.map(r => ({
      userId: r.user.id,
      eventId,
      outcome: 'won' as const,
      semester: semesterLabel,
    })),
    ...draftRejected.map(r => ({
      userId: r.user.id,
      eventId,
      outcome: 'lost' as const,
      semester: semesterLabel,
    })),
  ];
  await upsertLotteryHistoryEntries(historyEntries);

  const auditEntries = [
    ...draftSelected.map(r => ({
      registrationId: r.registration.id,
      eventId,
      userId: r.user.id,
      oldStatus: 'draft_selected',
      newStatus: 'selected',
      action: 'lottery_won' as const,
      actorId: null as string | null,
      actorType: 'system',
    })),
    ...draftRejected.map(r => ({
      registrationId: r.registration.id,
      eventId,
      userId: r.user.id,
      oldStatus: 'draft_rejected',
      newStatus: 'pending_approval',
      action: 'lottery_lost' as const,
      actorId: null as string | null,
      actorType: 'system',
    })),
  ];
  await createAuditLogEntries(auditEntries);

  await dbUpdateEvent(eventId, { lotteryStatus: 'finalized' });

  await notifyLotteryResults(event, draftSelected, draftRejected);

  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath(`/user/events/${eventId}`);
}

export async function discardLotteryDraft(eventId: string) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const event = await getEventById(eventId);
  if (!event || event.lotteryStatus !== 'draft') throw new Error('No lottery draft in progress');
  assertLotteryEventCanMutate(event);

  const [regs, lotteryParticipants] = await Promise.all([
    getEventRegistrations(eventId),
    getEventLotteryParticipantIds(eventId),
  ]);
  const isRerun = lotteryParticipants.size > 0;

  const draftEntrants = regs.filter(r =>
    r.registration.status === 'draft_selected' || r.registration.status === 'draft_rejected'
  );

  await Promise.all(
    draftEntrants.map(r =>
      updateRegistration(r.registration.id, {
        status: 'pending_approval',
        lotteryPriorityScore: null,
      })
    )
  );

  await dbUpdateEvent(eventId, { lotteryStatus: isRerun ? 'finalized' : null });

  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath(`/user/events/${eventId}`);
}

export async function closeRegistration(eventId: string) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const event = await getEventById(eventId);
  if (!event || event.status !== 'open') throw new Error('Event is not open');

  await dbUpdateEvent(eventId, { status: 'closed' });

  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath('/admin/events');
  revalidatePath(`/user/events/${eventId}`);
  revalidatePath('/user/events');
}

/**
 * Cancel an event. Sets status='cancelled', emails every non-rejected registrant.
 * Idempotent per registration so re-cancelling is safe (e.g. admin slip).
 */
export async function cancelEventAction(eventId: string, reason?: string | null) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const event = await getEventById(eventId);
  if (!event) throw new Error('Event not found');
  if (event.status === 'cancelled') return; // idempotent
  if (event.status === 'completed') throw new Error('Cannot cancel a completed event');

  // Snapshot registrants BEFORE the status flip - emails go out based on this list.
  const regs = await getEventRegistrations(eventId);
  const toNotify = regs.filter(r => r.registration.status !== 'rejected' && r.user.email);

  // Reset lottery state if active. Without this, finalize/reroll still pass their `lotteryStatus`
  // gate even after cancel, and admins could accidentally email "you got in" for a dead event.
  if (event.lotteryStatus === 'draft') {
    const draftEntrants = regs.filter(
      r => r.registration.status === 'draft_selected' || r.registration.status === 'draft_rejected',
    );
    await Promise.all(
      draftEntrants.map(r =>
        updateRegistration(r.registration.id, { status: 'pending_approval', lotteryPriorityScore: null }),
      ),
    );
    await dbUpdateEvent(eventId, { status: 'cancelled', lotteryStatus: null });
  } else {
    await dbUpdateEvent(eventId, { status: 'cancelled' });
  }

  await notifyEventCancelledRegistrants(event, toNotify, reason ?? null);

  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath('/admin/events');
  revalidatePath(`/user/events/${eventId}`);
  revalidatePath('/user/events');
}

export async function checkinAttendee(registrationId: string, eventId: string) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const regs = await getEventRegistrations(eventId);
  const reg = regs.find(r => r.registration.id === registrationId);

  await updateRegistration(registrationId, { status: 'checked_in' });
  if (reg) {
    await createAuditLogEntry({
      registrationId,
      eventId,
      userId: reg.user.id,
      oldStatus: reg.registration.status,
      newStatus: 'checked_in',
      action: 'checked_in',
      actorId: session.user.id,
      actorType: 'admin',
    });
  }
  revalidatePath(`/admin/events/${eventId}/checkin`);
}

export async function undoCheckin(registrationId: string, eventId: string, previousStatus: 'registered' | 'selected') {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const regs = await getEventRegistrations(eventId);
  const reg = regs.find(r => r.registration.id === registrationId);

  await updateRegistration(registrationId, { status: previousStatus });
  if (reg) {
    await createAuditLogEntry({
      registrationId,
      eventId,
      userId: reg.user.id,
      oldStatus: 'checked_in',
      newStatus: previousStatus,
      action: 'status_changed',
      actorId: session.user.id,
      actorType: 'admin',
    });
  }
  revalidatePath(`/admin/events/${eventId}/checkin`);
}

export async function closeEvent(eventId: string) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  // Revoke lottery wins for lottery winners who didn't check in
  const regs = await getEventRegistrations(eventId);
  const noShowLotteryWinners = regs
    .filter(r => r.registration.status === 'selected')
    .map(r => r.user.id);
  await deleteLotteryWins(eventId, noShowLotteryWinners);

  // Audit log entries for all registrations about to be marked no-show
  const willBeNoShow = regs.filter(r =>
    ['registered', 'selected'].includes(r.registration.status)
  );
  if (willBeNoShow.length > 0) {
    await createAuditLogEntries(willBeNoShow.map(r => ({
      registrationId: r.registration.id,
      eventId,
      userId: r.user.id,
      oldStatus: r.registration.status,
      newStatus: 'no_show',
      action: 'no_show' as const,
      actorId: session.user.id,
      actorType: 'admin' as const,
    })));
  }

  await bulkMarkNoShow(eventId);
  await dbUpdateEvent(eventId, { status: 'completed' });

  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath('/admin/events');
  revalidatePath('/admin');
}

export async function removeRegistration(registrationId: string, eventId: string) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const regs = await getEventRegistrations(eventId);
  const reg = regs.find(r => r.registration.id === registrationId);
  if (!reg) throw new Error('Registration not found');

  // Use null registrationId so the audit entry survives cascade delete
  // of the registration.
  await createAuditLogEntry({
    registrationId: null,
    eventId,
    userId: reg.user.id,
    oldStatus: reg.registration.status,
    newStatus: 'removed',
    action: 'removed',
    actorId: session.user.id,
    actorType: 'admin',
  });

  await deleteRegistration(reg.user.id, eventId);
  revalidatePath(`/admin/events/${eventId}`);
}

async function getPendingRegistration(registrationId: string, eventId: string) {
  const regs = await getEventRegistrations(eventId);
  const reg = regs.find(r => r.registration.id === registrationId);
  if (!reg) throw new Error('Registration not found');
  if (reg.registration.status !== 'pending_approval') {
    throw new Error('Registration is not pending approval');
  }
  return reg;
}

export async function approveRegistration(registrationId: string, eventId: string) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const event = await getEventById(eventId);
  if (!event) throw new Error('Event not found');

  const reg = await getPendingRegistration(registrationId, eventId);

  // Check if this registration is part of an accepted pair (both must be pending_approval)
  let partnerReg: Awaited<ReturnType<typeof getPendingRegistration>> | null = null;
  if (event.plusOneEnabled) {
    const outgoing = await getOutgoingInvite(registrationId);
    const incoming = await getIncomingInvite(registrationId);
    const invite = outgoing || incoming;
    if (invite && invite.status === 'accepted') {
      const partnerRegId = invite.inviterRegistrationId === registrationId
        ? invite.inviteeRegistrationId
        : invite.inviterRegistrationId;
      try {
        partnerReg = await getPendingRegistration(partnerRegId, eventId);
      } catch {
        // Partner is not pending_approval - treat this registration as solo
        partnerReg = null;
      }
    }
  }

  const slotsNeeded = partnerReg ? 2 : 1;
  const confirmedCount = await getRegistrationCount(eventId, ['registered', 'selected', 'checked_in']);
  const openSlots = event.capacity - confirmedCount;
  if (openSlots < slotsNeeded) {
    throw new Error(partnerReg
      ? 'Approving this pair requires 2 open slots'
      : 'Event is at capacity'
    );
  }

  await updateRegistration(registrationId, { status: 'registered' });
  await createAuditLogEntry({
    registrationId,
    eventId,
    userId: reg.user.id,
    oldStatus: 'pending_approval',
    newStatus: 'registered',
    action: 'approved',
    actorId: session.user.id,
    actorType: 'admin',
  });

  if (partnerReg) {
    await updateRegistration(partnerReg.registration.id, { status: 'registered' });
    await createAuditLogEntry({
      registrationId: partnerReg.registration.id,
      eventId,
      userId: partnerReg.user.id,
      oldStatus: 'pending_approval',
      newStatus: 'registered',
      action: 'approved',
      actorId: session.user.id,
      actorType: 'admin',
    });
  }

  const recipients = [reg, ...(partnerReg ? [partnerReg] : [])];
  await notifyRegistrationApproved(event, recipients);

  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath(`/user/events/${eventId}`);
}

export async function denyRegistration(registrationId: string, eventId: string) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const event = await getEventById(eventId);
  if (!event) throw new Error('Event not found');

  const reg = await getPendingRegistration(registrationId, eventId);

  // If part of an accepted pair, deny both
  let partnerReg: Awaited<ReturnType<typeof getPendingRegistration>> | null = null;
  if (event.plusOneEnabled) {
    const outgoing = await getOutgoingInvite(registrationId);
    const incoming = await getIncomingInvite(registrationId);
    const invite = outgoing || incoming;
    if (invite && invite.status === 'accepted') {
      const partnerRegId = invite.inviterRegistrationId === registrationId
        ? invite.inviteeRegistrationId
        : invite.inviterRegistrationId;
      try {
        partnerReg = await getPendingRegistration(partnerRegId, eventId);
      } catch {
        partnerReg = null;
      }
    }
  }

  await updateRegistration(registrationId, { status: 'rejected' });
  await createAuditLogEntry({
    registrationId,
    eventId,
    userId: reg.user.id,
    oldStatus: 'pending_approval',
    newStatus: 'rejected',
    action: 'denied',
    actorId: session.user.id,
    actorType: 'admin',
  });

  if (partnerReg) {
    await updateRegistration(partnerReg.registration.id, { status: 'rejected' });
    await createAuditLogEntry({
      registrationId: partnerReg.registration.id,
      eventId,
      userId: partnerReg.user.id,
      oldStatus: 'pending_approval',
      newStatus: 'rejected',
      action: 'denied',
      actorId: session.user.id,
      actorType: 'admin',
    });
  }

  const recipients = [reg, ...(partnerReg ? [partnerReg] : [])];
  await notifyRegistrationRejected(event, recipients);

  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath(`/user/events/${eventId}`);
}

// `selected` excluded - lottery-only status set via finalizeLottery, not manual admin change
const ALLOWED_STATUS_CHANGES = ['registered', 'waitlisted', 'pending_approval', 'rejected', 'checked_in', 'no_show'] as const;

export async function changeRegistrationStatus(
  registrationId: string,
  eventId: string,
  newStatus: string,
) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  if (!ALLOWED_STATUS_CHANGES.includes(newStatus as typeof ALLOWED_STATUS_CHANGES[number])) {
    throw new Error('Invalid status');
  }

  const event = await getEventById(eventId);
  if (!event) throw new Error('Event not found');

  const regs = await getEventRegistrations(eventId);
  const reg = regs.find(r => r.registration.id === registrationId);
  if (!reg) throw new Error('Registration not found');

  if (reg.registration.status === newStatus) {
    throw new Error('Registration already has this status');
  }

  // Capacity check when moving to a "going" status
  if (newStatus === 'registered' || newStatus === 'checked_in') {
    const goingStatuses = ['registered', 'selected', 'checked_in'];
    const isAlreadyGoing = goingStatuses.includes(reg.registration.status);
    if (!isAlreadyGoing) {
      const confirmedCount = await getRegistrationCount(eventId, goingStatuses);
      if (confirmedCount >= event.capacity) {
        throw new Error('Event is at capacity');
      }
    }
  }

  // Revoke lottery win if a lottery winner is moved to a non-going status
  const goingStatuses = ['registered', 'selected', 'checked_in'];
  if (reg.registration.status === 'selected' && !goingStatuses.includes(newStatus)) {
    await deleteLotteryWins(eventId, [reg.user.id]);
  }

  await updateRegistration(registrationId, { status: newStatus as typeof ALLOWED_STATUS_CHANGES[number] });
  await createAuditLogEntry({
    registrationId,
    eventId,
    userId: reg.user.id,
    oldStatus: reg.registration.status,
    newStatus: newStatus,
    action: 'status_changed',
    actorId: session.user.id,
    actorType: 'admin',
  });

  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath(`/user/events/${eventId}`);
}

export async function accessEventByInviteCode(code: string) {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');

  const event = await getEventByInviteCode(code);
  if (!event) throw new Error('Invalid invite code');

  await createEventAccess(session.user.id, event.id);
  return event.id;
}

export async function regenerateInviteCode(eventId: string) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const event = await getEventById(eventId);
  if (!event || event.visibility !== 'private') {
    throw new Error('Can only regenerate invite codes for private events');
  }

  const newCode = Buffer.from(crypto.getRandomValues(new Uint8Array(12))).toString('base64url');
  await dbUpdateEvent(eventId, { inviteCode: newCode });

  revalidatePath(`/admin/events/${eventId}`);
  return newCode;
}

export async function deleteEventAction(eventId: string) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const event = await getEventById(eventId);
  if (!event) throw new Error('Event not found');

  await dbDeleteEvent(eventId);

  revalidatePath('/admin/events');
  revalidatePath('/user/events');
}

export async function getUserDetailForModal(userId: string) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const user = await getUserById(userId);
  if (!user) return null;

  const semesterLabel = await getCurrentSemesterLabel();
  const [eventHistory, lotteryStats, noShowCount] = await Promise.all([
    getUserEventHistory(userId),
    getUserLotteryStats(userId, semesterLabel),
    getUserNoShowCount(userId),
  ]);

  const checkedInCount = eventHistory.filter(h => h.registration.status === 'checked_in').length;

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      major: user.major,
      classYear: user.classYear,
      bio: user.bio,
    },
    stats: {
      noShowCount,
      eventsAttended: checkedInCount,
      semesterLotteryWins: lotteryStats.wins,
      semesterLotteryLosses: lotteryStats.losses,
    },
    eventHistory: eventHistory.map(h => ({
      eventName: h.event.name,
      eventDate: h.event.date,
      status: h.registration.status,
    })),
  };
}

export async function getRegistrationTimeline(registrationId: string) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  return dbGetRegistrationAuditLog(registrationId);
}

// ============================================================================
// +1 Invite Actions
// ============================================================================

/** Send a +1 invite to another registered user. */
export async function invitePlusOne(eventId: string, inviteeUserId: string) {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');

  const event = await getEventById(eventId);
  if (!event || event.status !== 'open') throw new Error('Event not available');
  if (!event.plusOneEnabled) throw new Error('+1 guests are not enabled for this event');
  if (inviteeUserId === session.user.id) throw new Error('You cannot invite yourself');

  const [inviterReg, inviteeReg] = await Promise.all([
    getUserRegistration(session.user.id, eventId),
    getUserRegistration(inviteeUserId, eventId),
  ]);
  if (!inviterReg) throw new Error('You must be registered for this event to invite a +1');
  if (!inviteeReg) throw new Error('The person you are inviting must also be registered for this event');

  // Check neither party already has an invite for this event
  const [existingOutgoing, existingIncoming] = await Promise.all([
    getOutgoingInvite(inviterReg.id),
    getIncomingInvite(inviteeReg.id),
  ]);
  if (existingOutgoing) throw new Error('You already have an active +1 invite for this event');
  const [inviterIncoming, inviteeOutgoing] = await Promise.all([
    getIncomingInvite(inviterReg.id),
    getOutgoingInvite(inviteeReg.id),
  ]);
  if (inviterIncoming) throw new Error('You already have an incoming +1 invite for this event');
  if (existingIncoming || inviteeOutgoing) throw new Error('This person already has an active +1 invite for this event');

  const invite = await createPlusOneInvite({
    eventId,
    inviterRegistrationId: inviterReg.id,
    inviteeRegistrationId: inviteeReg.id,
  });

  // Email the invitee - this is the primary out-of-band signal that an invite exists.
  const [inviter, invitee] = await Promise.all([
    getUserById(session.user.id),
    getUserById(inviteeUserId),
  ]);
  if (invitee?.email) {
    const eventSummary = buildEventSummary(event);
    await sendTransactional({
      template: 'plus_one_invite_received',
      recipient: { userId: invitee.id, email: invitee.email, name: invitee.name },
      payload: { inviteeName: invitee.name, inviterName: inviter?.name ?? null, event: eventSummary },
      idempotencyKey: `plus_one_invite_received:${invite.id}`,
      relatedEventId: eventId,
      relatedRegistrationId: inviteeReg.id,
    });
  }

  revalidatePath(`/user/events/${eventId}`);
}

/** Accept a pending +1 invite (invitee only). */
export async function acceptPlusOneInvite(inviteId: string) {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');

  const invite = await getPlusOneInviteById(inviteId);
  if (!invite || invite.status !== 'pending') throw new Error('Invite not found or already handled');

  // Verify current user is the invitee
  const inviteeReg = await getUserRegistration(session.user.id, invite.eventId);
  if (!inviteeReg || inviteeReg.id !== invite.inviteeRegistrationId) {
    throw new Error('You are not the recipient of this invite');
  }

  await updatePlusOneInviteStatus(inviteId, 'accepted');

  // Notify the original inviter that their invite was accepted.
  await notifyInviterOfPlusOneResponse(invite.id, 'accepted');

  revalidatePath(`/user/events/${invite.eventId}`);
}

/**
 * Look up the inviter for a +1 invite and send them a `plus_one_accepted` or `plus_one_declined`
 * email. Failures are swallowed by sendTransactional.
 */
async function notifyInviterOfPlusOneResponse(inviteId: string, kind: 'accepted' | 'declined') {
  const invite = await getPlusOneInviteById(inviteId);
  if (!invite) return;
  const event = await getEventById(invite.eventId);
  if (!event) return;
  const allRegs = await getEventRegistrations(invite.eventId);
  const inviterReg = allRegs.find(r => r.registration.id === invite.inviterRegistrationId);
  const inviteeReg = allRegs.find(r => r.registration.id === invite.inviteeRegistrationId);
  if (!inviterReg?.user.email) return;
  const eventSummary = buildEventSummary(event);
  await sendTransactional({
    template: kind === 'accepted' ? 'plus_one_accepted' : 'plus_one_declined',
    recipient: { userId: inviterReg.user.id, email: inviterReg.user.email, name: inviterReg.user.name },
    payload: {
      inviterName: inviterReg.user.name,
      inviteeName: inviteeReg?.user.name ?? null,
      event: eventSummary,
    },
    idempotencyKey: `plus_one_${kind}:${invite.id}`,
    relatedEventId: invite.eventId,
    relatedRegistrationId: inviterReg.registration.id,
  });
}

/** Decline a pending +1 invite (invitee only). */
export async function declinePlusOneInvite(inviteId: string) {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');

  const invite = await getPlusOneInviteById(inviteId);
  if (!invite || invite.status !== 'pending') throw new Error('Invite not found or already handled');

  // Verify current user is the invitee
  const inviteeReg = await getUserRegistration(session.user.id, invite.eventId);
  if (!inviteeReg || inviteeReg.id !== invite.inviteeRegistrationId) {
    throw new Error('You are not the recipient of this invite');
  }

  // Capture inviter info BEFORE the delete cascades - the invite row goes away.
  const event = await getEventById(invite.eventId);
  const allRegs = await getEventRegistrations(invite.eventId);
  const inviterReg = allRegs.find(r => r.registration.id === invite.inviterRegistrationId);
  const inviteeRegRow = allRegs.find(r => r.registration.id === invite.inviteeRegistrationId);

  await deletePlusOneInvite(inviteId);

  if (event && inviterReg?.user.email) {
    const eventSummary = buildEventSummary(event);
    await sendTransactional({
      template: 'plus_one_declined',
      recipient: { userId: inviterReg.user.id, email: inviterReg.user.email, name: inviterReg.user.name },
      payload: {
        inviterName: inviterReg.user.name,
        inviteeName: inviteeRegRow?.user.name ?? null,
        event: eventSummary,
      },
      idempotencyKey: `plus_one_declined:${invite.id}`,
      relatedEventId: invite.eventId,
      relatedRegistrationId: inviterReg.registration.id,
    });
  }

  revalidatePath(`/user/events/${invite.eventId}`);
}

/** Cancel a pending outgoing invite (inviter only). */
export async function cancelPlusOneInvite(inviteId: string) {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');

  const invite = await getPlusOneInviteById(inviteId);
  if (!invite || invite.status !== 'pending') throw new Error('Invite not found or already handled');

  // Verify current user is the inviter
  const inviterReg = await getUserRegistration(session.user.id, invite.eventId);
  if (!inviterReg || inviterReg.id !== invite.inviterRegistrationId) {
    throw new Error('You are not the sender of this invite');
  }

  // Capture details BEFORE deletion. Only email the invitee if they were already notified of
  // the original invite (look up outbox by idempotency key).
  const event = await getEventById(invite.eventId);
  const allRegs = await getEventRegistrations(invite.eventId);
  const inviteeReg = allRegs.find(r => r.registration.id === invite.inviteeRegistrationId);
  const inviterRegRow = allRegs.find(r => r.registration.id === invite.inviterRegistrationId);
  const inviteWasSent = await wasInviteEmailSent(invite.id);

  await deletePlusOneInvite(inviteId);

  if (event && inviteWasSent && inviteeReg?.user.email) {
    const eventSummary = buildEventSummary(event);
    await sendTransactional({
      template: 'plus_one_cancelled',
      recipient: { userId: inviteeReg.user.id, email: inviteeReg.user.email, name: inviteeReg.user.name },
      payload: {
        inviteeName: inviteeReg.user.name,
        inviterName: inviterRegRow?.user.name ?? null,
        event: eventSummary,
      },
      idempotencyKey: `plus_one_cancelled:${invite.id}`,
      relatedEventId: invite.eventId,
      relatedRegistrationId: inviteeReg.registration.id,
    });
  }

  revalidatePath(`/user/events/${invite.eventId}`);
}

/**
 * Returns true if a `plus_one_invite_received` email was previously queued/sent for this invite.
 * Used to gate the "cancelled" notification - we don't tell someone an invite was cancelled if
 * they never knew it existed.
 */
async function wasInviteEmailSent(inviteId: string): Promise<boolean> {
  const { db } = await import('@/lib/db');
  const { emailOutbox } = await import('@/lib/db/schema');
  const { eq, inArray, and } = await import('drizzle-orm');
  // Include 'queued' and 'sending' so a fast cancel-after-invite still triggers the cancel
  // notification - the queued invite email may be milliseconds from going out, and the
  // invitee shouldn't get an "invited" email with no follow-up.
  const rows = await db
    .select({ id: emailOutbox.id })
    .from(emailOutbox)
    .where(
      and(
        eq(emailOutbox.idempotencyKey, `plus_one_invite_received:${inviteId}`),
        inArray(emailOutbox.status, ['queued', 'sending', 'sent', 'delivered', 'bounced']),
      )!,
    )
    .limit(1);
  return rows.length > 0;
}

/** Dissolve an accepted +1 pairing (either party can do this). */
export async function dissolvePlusOnePairing(inviteId: string) {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');

  const invite = await getPlusOneInviteById(inviteId);
  if (!invite || invite.status !== 'accepted') throw new Error('Accepted pairing not found');

  // Verify current user is either party
  const userReg = await getUserRegistration(session.user.id, invite.eventId);
  if (!userReg || (userReg.id !== invite.inviterRegistrationId && userReg.id !== invite.inviteeRegistrationId)) {
    throw new Error('You are not part of this pairing');
  }

  await deletePlusOneInvite(inviteId);
  revalidatePath(`/user/events/${invite.eventId}`);
}

/** Get registrations available to invite (registered members, not self, not already paired). */
export async function getInvitableUsers(eventId: string) {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');

  const event = await getEventById(eventId);
  if (!event) throw new Error('Event not found');

  if (event.status !== 'open') throw new Error('Event not available');
  if (!event.plusOneEnabled) throw new Error('+1 guests are not enabled for this event');

  // Private event access check (admins bypass - match the user-side detail page rule)
  if (event.visibility === 'private' && !session.user.isAdmin) {
    const access = await hasEventAccess(session.user.id, eventId);
    if (!access) throw new Error('Event not found');
  }

  // Caller must be registered for this event before they can browse invitable users
  const callerReg = await getUserRegistration(session.user.id, eventId);
  if (!callerReg) throw new Error('You must be registered for this event to invite a +1');
  if (!['registered', 'pending_approval', 'waitlisted'].includes(callerReg.status)) {
    throw new Error('Your registration is not eligible to invite a +1');
  }

  const [regs, allInvites] = await Promise.all([
    getEventRegistrations(eventId),
    getAllEventInvites(eventId),
  ]);

  // Build set of registration IDs that are involved in any invite
  // (both sides of every invite are excluded from the invitable list)
  const invitedRegIds = new Set<string>();
  for (const invite of allInvites) {
    invitedRegIds.add(invite.inviterRegistrationId);
    invitedRegIds.add(invite.inviteeRegistrationId);
  }

  return regs
    .filter(r =>
      r.user.id !== session.user.id &&
      !invitedRegIds.has(r.registration.id) &&
      // Only show confirmed-ish registrations: registered, pending_approval, waitlisted
      ['registered', 'pending_approval', 'waitlisted'].includes(r.registration.status)
    )
    .map(r => ({ id: r.user.id, name: r.user.name, image: r.user.image }));
}

// ============================================================================
// Event Photo Actions
// ============================================================================

const PHOTO_CAPTION_MAX = 200;

function eventHasEndedForAlbum(event: Event) {
  return new Date(event.endDate ?? event.date) < new Date()
    || event.status === 'completed'
    || event.status === 'cancelled';
}

/**
 * Phase 1 of the direct-upload flow: mint short-lived signed upload URLs so the browser PUTs
 * each file straight to Supabase Storage. The service role key never leaves the server, but
 * file bytes never enter the Vercel function (sidesteps the 1 MB Server Action and 4.5 MB
 * Hobby body caps and lets the client parallelize uploads).
 */
export async function createEventPhotoUploadTicketsAction(
  eventId: string,
  files: UploadTicketRequest[],
): Promise<UploadTicket[]> {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const event = await getEventById(eventId);
  if (!event) throw new Error('Event not found');

  return createEventPhotoUploadTickets(eventId, files);
}

/**
 * Phase 2: persist DB rows for the storage paths the client successfully uploaded. Tampering
 * is bounded by the path prefix check - a client cannot point a row at someone else's path.
 */
export async function recordEventPhotosAction(
  eventId: string,
  photos: { storagePath: string; caption?: string | null }[],
) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const event = await getEventById(eventId);
  if (!event) throw new Error('Event not found');

  if (photos.length === 0) return [];

  const prefix = `events/${eventId}/`;
  const rows = photos.map((photo) => {
    if (!photo.storagePath.startsWith(prefix)) {
      throw new Error('Invalid storage path');
    }
    return {
      eventId,
      storagePath: photo.storagePath,
      publicUrl: getEventPhotoPublicUrl(photo.storagePath),
      caption: photo.caption?.trim() || null,
      uploadedBy: session.user.id,
    };
  });

  const created = await createEventPhotos(rows);

  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath(`/user/events/${eventId}`);
  return created;
}

export async function deleteEventPhotoAction(photoId: string) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const photo = await getEventPhotoById(photoId);
  if (!photo) throw new Error('Photo not found');

  // DB row first - an orphaned storage object is harmless, but a DB row pointing
  // at a deleted file would render a broken image.
  await dbDeleteEventPhoto(photoId);

  // Best-effort storage delete; we don't fail the action if Supabase rejects.
  try {
    await deleteEventPhotoObject(photo.storagePath);
  } catch (err) {
    console.error('[deleteEventPhotoAction] storage cleanup failed:', err);
  }

  revalidatePath(`/admin/events/${photo.eventId}`);
  revalidatePath(`/user/events/${photo.eventId}`);
}

export async function updateEventPhotoCaptionAction(photoId: string, caption: string) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const trimmed = caption.trim();
  if (trimmed.length > PHOTO_CAPTION_MAX) {
    throw new Error(`Caption must be ${PHOTO_CAPTION_MAX} characters or fewer`);
  }

  const photo = await getEventPhotoById(photoId);
  if (!photo) throw new Error('Photo not found');

  await dbUpdateEventPhotoCaption(photoId, trimmed || null);

  revalidatePath(`/admin/events/${photo.eventId}`);
  revalidatePath(`/user/events/${photo.eventId}`);
}

/**
 * Returns photos for a user-facing view, with access enforced.
 * Public events: any logged-in user.
 * Private events: viewer must have event_access OR a registration of any status.
 * Admins bypass.
 */
export async function getEventPhotosForViewer(eventId: string) {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');

  const event = await getEventById(eventId);
  if (!event) throw new Error('Event not found');

  if (!eventHasEndedForAlbum(event)) return [];

  if (event.visibility === 'private' && !session.user.isAdmin) {
    const [access, reg] = await Promise.all([
      hasEventAccess(session.user.id, eventId),
      getUserRegistration(session.user.id, eventId),
    ]);
    if (!access && !reg) throw new Error('Event not found');
  }

  return dbGetEventPhotos(eventId);
}

// ============================================================================
// Photo album notifications
// ============================================================================

/**
 * Admin-triggered notification: "photos are up" email to every confirmed attendee
 * (registered/selected/checked_in - excluding no_show). One-shot per event via the
 * event-scoped idempotency key on the outbox row.
 */
export async function notifyPhotoAlbumAction(eventId: string) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const event = await getEventById(eventId);
  if (!event) throw new Error('Event not found');
  if (!eventHasEndedForAlbum(event)) {
    throw new Error('Photo notifications can only be sent after the event has ended');
  }

  const photos = await dbGetEventPhotos(eventId);
  if (photos.length === 0) throw new Error('No photos uploaded for this event yet');

  const regs = await getEventRegistrations(eventId);
  const recipients = regs.filter(
    r =>
      ['registered', 'selected', 'checked_in'].includes(r.registration.status) &&
      r.user.email,
  );
  if (recipients.length === 0) throw new Error('No confirmed attendees to notify');

  const result = await notifyPhotoAlbumAvailable(event, recipients, photos.length);

  revalidatePath(`/admin/events/${eventId}`);
  return result;
}

/**
 * Admin "Re-send confirmation emails" - fires `registration_approved` (or equivalent) for
 * every confirmed registrant. Replaces the legacy mailto fallback in send-invite-button.tsx.
 * Idempotency key includes a timestamp so admins can re-send if they really mean it.
 */
export async function resendConfirmationEmailsAction(eventId: string) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const event = await getEventById(eventId);
  if (!event) throw new Error('Event not found');

  const regs = await getEventRegistrations(eventId);
  const confirmed = regs.filter(
    r =>
      ['registered', 'selected', 'checked_in'].includes(r.registration.status) &&
      r.user.email,
  );
  if (confirmed.length === 0) throw new Error('No confirmed registrants to email');

  const result = await resendRegistrationConfirmations(event, confirmed);
  return { queued: result.newlySent };
}
