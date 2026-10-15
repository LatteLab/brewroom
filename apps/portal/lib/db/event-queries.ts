import { db } from './index';
import { events, eventRegistrations, eventAccess, lotteryHistory, users, semesters, registrationAuditLog, eventPlusOneInvites, eventEditLog } from './schema';
import { eq, and, or, desc, gte, lt, count, inArray, isNull, sql } from 'drizzle-orm';
import type { Event, NewEvent, EventRegistration, NewRegistrationAuditLog, EventPlusOneInvite, NewEventPlusOneInvite, NewEventEditLog } from './schema';
import type { RegistrationRow, RegistrationWithStats } from '@/lib/types/event';

// ============================================================================
// Event Queries
// ============================================================================

export async function getEvents(filter?: 'upcoming' | 'past') {
  const now = new Date();
  const query = db.select().from(events);

  if (filter === 'upcoming') {
    return query.where(gte(events.date, now)).orderBy(events.date);
  }
  if (filter === 'past') {
    return query.where(lt(events.date, now)).orderBy(desc(events.date));
  }
  return query.orderBy(desc(events.date));
}

export async function getPublishedEvents(filter?: 'upcoming' | 'past') {
  const now = new Date();
  const baseConditions = [
    eq(events.visibility, 'public'),
  ];

  if (filter === 'upcoming') {
    baseConditions.push(gte(events.date, now));
    baseConditions.push(eq(events.status, 'open'));
  } else if (filter === 'past') {
    baseConditions.push(or(lt(events.date, now), inArray(events.status, ['closed', 'completed']))!);
  }

  const orderDir = filter === 'past' ? desc(events.date) : events.date;

  return db.select().from(events)
    .where(and(...baseConditions))
    .orderBy(orderDir);
}

export async function getEventById(id: string): Promise<Event | null> {
  const [event] = await db.select().from(events).where(eq(events.id, id)).limit(1);
  return event || null;
}

export async function createEvent(data: NewEvent): Promise<Event> {
  const [event] = await db.insert(events).values(data).returning();
  return event;
}

export async function updateEvent(id: string, data: Partial<NewEvent>): Promise<Event> {
  const [event] = await db.update(events)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(events.id, id))
    .returning();
  return event;
}

export async function deleteEvent(id: string) {
  // event_registrations, event_access, lottery_history all have onDelete: cascade
  // so deleting the event cascades to all related rows
  await db.delete(events).where(eq(events.id, id));
}

// ============================================================================
// Event Access Queries (for private events)
// ============================================================================

export async function createEventAccess(userId: string, eventId: string) {
  const [access] = await db.insert(eventAccess)
    .values({ userId, eventId })
    .onConflictDoNothing()
    .returning();
  return access;
}

export async function hasEventAccess(userId: string, eventId: string): Promise<boolean> {
  const [row] = await db.select({ id: eventAccess.id })
    .from(eventAccess)
    .where(and(
      eq(eventAccess.userId, userId),
      eq(eventAccess.eventId, eventId)
    ))
    .limit(1);
  return !!row;
}

export async function getEventByInviteCode(code: string): Promise<Event | null> {
  const [event] = await db.select().from(events)
    .where(eq(events.inviteCode, code))
    .limit(1);
  return event || null;
}

export async function getUserAccessedEventIds(userId: string): Promise<string[]> {
  const rows = await db.select({ eventId: eventAccess.eventId })
    .from(eventAccess)
    .where(eq(eventAccess.userId, userId));
  return rows.map(r => r.eventId);
}

// ============================================================================
// Registration Queries
// ============================================================================

export async function getEventRegistrations(eventId: string): Promise<RegistrationRow[]>;
export async function getEventRegistrations(eventId: string, options: { withStats: true }): Promise<RegistrationWithStats[]>;
export async function getEventRegistrations(eventId: string, options?: { withStats?: boolean }): Promise<RegistrationRow[]> {
  const registrations: RegistrationRow[] = await db.select({
    registration: eventRegistrations,
    user: {
      id: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
    },
  })
    .from(eventRegistrations)
    .innerJoin(users, eq(eventRegistrations.userId, users.id))
    .where(eq(eventRegistrations.eventId, eventId))
    .orderBy(eventRegistrations.createdAt);

  if (!options?.withStats || registrations.length === 0) return registrations;

  const semesterLabel = await getCurrentSemesterLabel();
  const userIds = registrations.map(r => r.user.id);

  const [noShowRows, attendedRows, lastEventRows, lotteryRows] = await Promise.all([
    db.select({ userId: eventRegistrations.userId, count: count() })
      .from(eventRegistrations)
      .where(and(inArray(eventRegistrations.userId, userIds), eq(eventRegistrations.status, 'no_show')))
      .groupBy(eventRegistrations.userId),

    db.select({ userId: eventRegistrations.userId, count: count() })
      .from(eventRegistrations)
      .where(and(inArray(eventRegistrations.userId, userIds), eq(eventRegistrations.status, 'checked_in')))
      .groupBy(eventRegistrations.userId),

    db.select({ userId: eventRegistrations.userId, eventName: events.name, eventDate: events.date })
      .from(eventRegistrations)
      .innerJoin(events, eq(eventRegistrations.eventId, events.id))
      .where(and(inArray(eventRegistrations.userId, userIds), eq(eventRegistrations.status, 'checked_in')))
      .orderBy(desc(events.date)),

    db.select({ userId: lotteryHistory.userId, outcome: lotteryHistory.outcome, count: count() })
      .from(lotteryHistory)
      .where(and(inArray(lotteryHistory.userId, userIds), eq(lotteryHistory.semester, semesterLabel)))
      .groupBy(lotteryHistory.userId, lotteryHistory.outcome),
  ]);

  const noShowMap = new Map(noShowRows.map(r => [r.userId, r.count]));
  const attendedMap = new Map(attendedRows.map(r => [r.userId, r.count]));

  const lastEventMap = new Map<string, { name: string; date: Date }>();
  for (const row of lastEventRows) {
    if (!lastEventMap.has(row.userId)) {
      lastEventMap.set(row.userId, { name: row.eventName, date: row.eventDate });
    }
  }

  const lotteryMap = new Map<string, { wins: number; losses: number }>();
  for (const row of lotteryRows) {
    const existing = lotteryMap.get(row.userId) || { wins: 0, losses: 0 };
    if (row.outcome === 'won') existing.wins = row.count;
    if (row.outcome === 'lost') existing.losses = row.count;
    lotteryMap.set(row.userId, existing);
  }

  return registrations.map(r => ({
    ...r,
    stats: {
      noShowCount: noShowMap.get(r.user.id) ?? 0,
      eventsAttended: attendedMap.get(r.user.id) ?? 0,
      lastEventName: lastEventMap.get(r.user.id)?.name ?? null,
      lastEventDate: lastEventMap.get(r.user.id)?.date ?? null,
      semesterLotteryWins: lotteryMap.get(r.user.id)?.wins ?? 0,
      semesterLotteryLosses: lotteryMap.get(r.user.id)?.losses ?? 0,
    },
  }));
}

export async function getRegistrationCount(eventId: string, statuses?: string[]) {
  const conditions = [eq(eventRegistrations.eventId, eventId)];
  if (statuses && statuses.length > 0) {
    conditions.push(
      inArray(eventRegistrations.status, statuses as EventRegistration['status'][])
    );
  }
  const [result] = await db.select({ count: count() })
    .from(eventRegistrations)
    .where(and(...conditions));
  return result?.count ?? 0;
}

export async function getUserRegistration(userId: string, eventId: string) {
  const [reg] = await db.select()
    .from(eventRegistrations)
    .where(and(
      eq(eventRegistrations.userId, userId),
      eq(eventRegistrations.eventId, eventId)
    ))
    .limit(1);
  return reg || null;
}

export async function createRegistration(data: {
  userId: string;
  eventId: string;
  status: EventRegistration['status'];
  questionnaireAnswers?: Record<string, string | boolean> | null;
}) {
  const [reg] = await db.insert(eventRegistrations)
    .values(data)
    .returning();
  return reg;
}

// Atomically register a user for an event, respecting capacity limits.
// Uses a transaction with SELECT FOR UPDATE on the event row to prevent
// over-capacity registrations under concurrent load.
// Returns the created registration and whether the user was waitlisted,
// or null if the event is full with no waitlist.
export async function createRegistrationWithCapacityCheck(data: {
  userId: string;
  eventId: string;
  capacity: number;
  waitlistEnabled: boolean;
  questionnaireAnswers?: Record<string, string | boolean> | null;
}): Promise<{ reg: EventRegistration; wasWaitlisted: boolean } | null> {
  const { userId, eventId, capacity, waitlistEnabled, questionnaireAnswers } = data;

  return db.transaction(async (tx) => {
    // Row-level lock on the event serializes concurrent registration attempts
    await tx.execute(sql`SELECT id FROM events WHERE id = ${eventId} FOR UPDATE`);

    const [{ currentCount }] = await tx
      .select({ currentCount: count() })
      .from(eventRegistrations)
      .where(and(
        eq(eventRegistrations.eventId, eventId),
        inArray(eventRegistrations.status, ['registered', 'checked_in']),
      ));

    if (currentCount < capacity) {
      const [reg] = await tx.insert(eventRegistrations)
        .values({ userId, eventId, status: 'registered', questionnaireAnswers })
        .returning();
      return { reg, wasWaitlisted: false };
    } else if (waitlistEnabled) {
      const [reg] = await tx.insert(eventRegistrations)
        .values({ userId, eventId, status: 'waitlisted', questionnaireAnswers })
        .returning();
      return { reg, wasWaitlisted: true };
    } else {
      return null;
    }
  });
}

// Atomically claim the lottery draft slot for an event.
// Uses a conditional UPDATE so only one concurrent caller can proceed.
// Returns true if this caller successfully claimed the slot.
export async function claimLotteryDraftSlot(eventId: string): Promise<boolean> {
  const [claimed] = await db.update(events)
    .set({ lotteryStatus: 'draft' })
    .where(and(eq(events.id, eventId), or(isNull(events.lotteryStatus), eq(events.lotteryStatus, 'finalized'))))
    .returning({ id: events.id });
  return !!claimed;
}

export async function updateRegistration(id: string, data: Partial<EventRegistration>) {
  const [reg] = await db.update(eventRegistrations)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(eventRegistrations.id, id))
    .returning();
  return reg;
}

export async function deleteRegistration(userId: string, eventId: string) {
  await db.delete(eventRegistrations)
    .where(and(
      eq(eventRegistrations.userId, userId),
      eq(eventRegistrations.eventId, eventId)
    ));
}

// ============================================================================
// Semester Queries
// ============================================================================

export function detectSemesterLabel(date: Date = new Date()): string {
  const month = date.getMonth();
  const year = date.getFullYear();
  if (month === 0) return `IAP ${year}`;
  if (month >= 1 && month <= 4) return `Spring ${year}`;
  if (month >= 5 && month <= 7) return `Summer ${year}`;
  return `Fall ${year}`;
}

export async function getCurrentSemesterLabel(): Promise<string> {
  const [override] = await db.select()
    .from(semesters)
    .where(eq(semesters.isCurrent, true))
    .limit(1);
  if (override) return override.label;
  return detectSemesterLabel();
}

export async function getSemesters() {
  return db.select().from(semesters).orderBy(desc(semesters.createdAt));
}

export async function setSemesterOverride(label: string) {
  await db.update(semesters)
    .set({ isCurrent: false })
    .where(eq(semesters.isCurrent, true));

  const [existing] = await db.select()
    .from(semesters)
    .where(eq(semesters.label, label))
    .limit(1);

  if (existing) {
    await db.update(semesters)
      .set({ isCurrent: true })
      .where(eq(semesters.id, existing.id));
  } else {
    await db.insert(semesters).values({ label, isCurrent: true });
  }
}

export async function clearSemesterOverride() {
  await db.update(semesters)
    .set({ isCurrent: false })
    .where(eq(semesters.isCurrent, true));
}

// ============================================================================
// Lottery Queries
// ============================================================================

export async function getLotteryHistory(userId: string) {
  return db.select().from(lotteryHistory)
    .where(eq(lotteryHistory.userId, userId))
    .orderBy(desc(lotteryHistory.createdAt));
}

export async function getUserNoShowCount(userId: string): Promise<number> {
  const [result] = await db.select({ count: count() })
    .from(eventRegistrations)
    .where(and(
      eq(eventRegistrations.userId, userId),
      eq(eventRegistrations.status, 'no_show')
    ));
  return result?.count ?? 0;
}

export async function getUserLotteryStats(userId: string, semester?: string | null) {
  const conditions = [eq(lotteryHistory.userId, userId)];
  if (semester) {
    conditions.push(eq(lotteryHistory.semester, semester));
  }

  const history = await db.select({
    outcome: lotteryHistory.outcome,
    count: count(),
  })
    .from(lotteryHistory)
    .where(and(...conditions))
    .groupBy(lotteryHistory.outcome);

  const wins = history.find(h => h.outcome === 'won')?.count ?? 0;
  const losses = history.find(h => h.outcome === 'lost')?.count ?? 0;
  return { wins, losses };
}

export async function computePriorityScore(userId: string): Promise<number> {
  const semesterLabel = await getCurrentSemesterLabel();
  const [stats, noShowCount] = await Promise.all([
    getUserLotteryStats(userId, semesterLabel),
    getUserNoShowCount(userId),
  ]);
  const raw = 1.0 + (stats.losses * 0.5) - (stats.wins * 0.75) - (noShowCount * 1.5);
  return Math.max(raw, 0.1);
}

export async function upsertLotteryHistoryEntries(
  entries: { userId: string; eventId: string; outcome: 'won' | 'lost'; semester?: string | null }[]
) {
  if (entries.length === 0) return;
  await db.insert(lotteryHistory)
    .values(entries)
    .onConflictDoUpdate({
      target: [lotteryHistory.userId, lotteryHistory.eventId],
      set: { outcome: sql`excluded.outcome`, semester: sql`excluded.semester` },
    });
}

export async function deleteLotteryWins(eventId: string, userIds: string[]) {
  if (userIds.length === 0) return;
  await db.delete(lotteryHistory).where(
    and(
      eq(lotteryHistory.eventId, eventId),
      inArray(lotteryHistory.userId, userIds),
      eq(lotteryHistory.outcome, 'won')
    )
  );
}

export async function getEventLotteryParticipantIds(eventId: string): Promise<Set<string>> {
  const rows = await db.selectDistinct({ userId: lotteryHistory.userId })
    .from(lotteryHistory)
    .where(eq(lotteryHistory.eventId, eventId));
  return new Set(rows.map(r => r.userId));
}

// ============================================================================
// User Timeline Queries
// ============================================================================

export async function getUserEvents(userId: string, filter?: 'upcoming' | 'past') {
  const now = new Date();

  const conditions = [
    eq(eventRegistrations.userId, userId),
  ];

  if (filter === 'upcoming') {
    conditions.push(gte(events.date, now));
    conditions.push(eq(events.status, 'open'));
  } else if (filter === 'past') {
    conditions.push(or(lt(events.date, now), inArray(events.status, ['closed', 'completed']))!);
  }

  // Subquery: count confirmed registrations per event
  const confirmedCounts = db
    .select({
      eventId: eventRegistrations.eventId,
      count: count().as('confirmed_count'),
    })
    .from(eventRegistrations)
    .where(
      inArray(eventRegistrations.status, ['registered', 'selected', 'checked_in'])
    )
    .groupBy(eventRegistrations.eventId)
    .as('confirmed_counts');

  // Registered events
  const registeredRows = await db
    .select({
      event: events,
      registrationStatus: eventRegistrations.status,
      registeredCount: confirmedCounts.count,
    })
    .from(eventRegistrations)
    .innerJoin(events, eq(eventRegistrations.eventId, events.id))
    .leftJoin(confirmedCounts, eq(events.id, confirmedCounts.eventId))
    .where(and(...conditions))
    .orderBy(filter === 'past' ? desc(events.date) : events.date);

  // Accessed private events (where user has access but no registration)
  const accessConditions = [
    eq(eventAccess.userId, userId),
    eq(events.visibility, 'private'),
  ];

  if (filter === 'upcoming') {
    accessConditions.push(gte(events.date, now));
    accessConditions.push(eq(events.status, 'open'));
  } else if (filter === 'past') {
    accessConditions.push(or(lt(events.date, now), inArray(events.status, ['closed', 'completed']))!);
  }

  const accessedRows = await db
    .select({
      event: events,
      registeredCount: confirmedCounts.count,
    })
    .from(eventAccess)
    .innerJoin(events, eq(eventAccess.eventId, events.id))
    .leftJoin(confirmedCounts, eq(events.id, confirmedCounts.eventId))
    .where(and(...accessConditions));

  // Merge: accessed events that aren't already in registered list
  const registeredEventIds = new Set(registeredRows.map(r => r.event.id));
  const accessOnly = accessedRows
    .filter(r => !registeredEventIds.has(r.event.id))
    .map(r => ({
      event: r.event,
      registrationStatus: null as string | null,
      registeredCount: r.registeredCount ?? 0,
    }));

  const all = [...registeredRows, ...accessOnly];
  all.sort((a, b) => {
    const dateA = new Date(a.event.date).getTime();
    const dateB = new Date(b.event.date).getTime();
    return filter === 'past' ? dateB - dateA : dateA - dateB;
  });

  return all.map((row) => ({
    event: row.event,
    registrationStatus: row.registrationStatus,
    registeredCount: row.registeredCount ?? 0,
  }));
}

// ============================================================================
// Check-in Queries
// ============================================================================

export async function getCheckinAttendees(eventId: string) {
  return db.select({
    registration: eventRegistrations,
    user: {
      id: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
    },
  })
    .from(eventRegistrations)
    .innerJoin(users, eq(eventRegistrations.userId, users.id))
    .where(and(
      eq(eventRegistrations.eventId, eventId),
      inArray(eventRegistrations.status, ['registered', 'selected', 'checked_in'])
    ))
    .orderBy(users.name);
}

export async function bulkMarkNoShow(eventId: string) {
  await db.update(eventRegistrations)
    .set({ status: 'no_show', updatedAt: new Date() })
    .where(and(
      eq(eventRegistrations.eventId, eventId),
      inArray(eventRegistrations.status, ['registered', 'selected'])
    ));
}

// ============================================================================
// Member Profile Queries
// ============================================================================

export async function updateUserProfile(userId: string, data: {
  major?: string | null;
  classYear?: string | null;
  phone?: string | null;
  interests?: string | null;
  bio?: string | null;
  location?: string | null;
  semesterStatus?: string | null;
  image?: string | null;
  isVisibleInDirectory?: boolean;
  hidePhone?: boolean;
}) {
  const [user] = await db.update(users)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  return user;
}

export async function getAllMembers() {
  return db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    image: users.image,
    major: users.major,
    classYear: users.classYear,
    phone: users.phone,
    interests: users.interests,
    bio: users.bio,
    location: users.location,
    semesterStatus: users.semesterStatus,
    isVisibleInDirectory: users.isVisibleInDirectory,
    hidePhone: users.hidePhone,
  })
    .from(users)
    .orderBy(users.name);
}

// Minimal query for member directory list — no PII beyond name/image/major/classYear
export async function getDirectoryList() {
  return db.select({
    id: users.id,
    name: users.name,
    image: users.image,
    major: users.major,
    classYear: users.classYear,
    semesterStatus: users.semesterStatus,
  })
    .from(users)
    .where(eq(users.isVisibleInDirectory, true))
    .orderBy(users.name);
}

// ============================================================================
// Analytics Queries
// ============================================================================

export async function getEventStats() {
  const allEvents = await db.select().from(events)
    .where(eq(events.status, 'completed'));

  const totalEvents = allEvents.length;

  if (totalEvents === 0) {
    return { totalEvents: 0, avgAttendanceRate: 0, noShowRate: 0 };
  }

  const eventIds = allEvents.map(e => e.id);
  const allRegs = await db.select({
    status: eventRegistrations.status,
    count: count(),
  })
    .from(eventRegistrations)
    .where(inArray(eventRegistrations.eventId, eventIds))
    .groupBy(eventRegistrations.status);

  const checkedIn = allRegs.find(r => r.status === 'checked_in')?.count ?? 0;
  const noShows = allRegs.find(r => r.status === 'no_show')?.count ?? 0;
  const total = checkedIn + noShows;

  return {
    totalEvents,
    avgAttendanceRate: total > 0 ? Math.round((checkedIn / total) * 100) : 0,
    noShowRate: total > 0 ? Math.round((noShows / total) * 100) : 0,
  };
}

export async function getWaitlistPosition(userId: string, eventId: string): Promise<number | null> {
  const reg = await getUserRegistration(userId, eventId);
  if (!reg || reg.status !== 'waitlisted') return null;

  const [result] = await db.select({ count: count() })
    .from(eventRegistrations)
    .where(and(
      eq(eventRegistrations.eventId, eventId),
      eq(eventRegistrations.status, 'waitlisted'),
      lt(eventRegistrations.createdAt, reg.createdAt),
    ));
  return (result?.count ?? 0) + 1;
}

export async function getUserEventHistory(userId: string) {
  return db.select({
    registration: eventRegistrations,
    event: {
      id: events.id,
      name: events.name,
      date: events.date,
    },
  })
    .from(eventRegistrations)
    .innerJoin(events, eq(eventRegistrations.eventId, events.id))
    .where(eq(eventRegistrations.userId, userId))
    .orderBy(desc(events.date));
}

export async function getUserAttendanceHistory(userId: string) {
  return db.select({
    id: events.id,
    name: events.name,
    date: events.date,
  })
    .from(eventRegistrations)
    .innerJoin(events, eq(eventRegistrations.eventId, events.id))
    .where(and(
      eq(eventRegistrations.userId, userId),
      eq(eventRegistrations.status, 'checked_in'),
    ))
    .orderBy(desc(events.date));
}

// ============================================================================
// Registration Audit Log Queries
// ============================================================================

export async function createAuditLogEntry(entry: NewRegistrationAuditLog) {
  const [row] = await db.insert(registrationAuditLog).values(entry).returning();
  return row;
}

export async function createAuditLogEntries(entries: NewRegistrationAuditLog[]) {
  if (entries.length === 0) return;
  await db.insert(registrationAuditLog).values(entries);
}

export async function getRegistrationAuditLog(registrationId: string) {
  return db.select({
    log: registrationAuditLog,
    actor: {
      id: users.id,
      name: users.name,
    },
  })
    .from(registrationAuditLog)
    .leftJoin(users, eq(registrationAuditLog.actorId, users.id))
    .where(eq(registrationAuditLog.registrationId, registrationId))
    .orderBy(desc(registrationAuditLog.createdAt));
}

// ============================================================================
// +1 Pairing Queries
// ============================================================================

/** Outgoing invite sent by this registration (as inviter). */
export async function getOutgoingInvite(inviterRegistrationId: string): Promise<EventPlusOneInvite | null> {
  const [row] = await db.select().from(eventPlusOneInvites)
    .where(eq(eventPlusOneInvites.inviterRegistrationId, inviterRegistrationId))
    .limit(1);
  return row || null;
}

/** Incoming invite received by this registration (as invitee). */
export async function getIncomingInvite(inviteeRegistrationId: string): Promise<EventPlusOneInvite | null> {
  const [row] = await db.select().from(eventPlusOneInvites)
    .where(eq(eventPlusOneInvites.inviteeRegistrationId, inviteeRegistrationId))
    .limit(1);
  return row || null;
}

/** Get invite by ID. */
export async function getPlusOneInviteById(id: string): Promise<EventPlusOneInvite | null> {
  const [row] = await db.select().from(eventPlusOneInvites)
    .where(eq(eventPlusOneInvites.id, id))
    .limit(1);
  return row || null;
}

/** All invites for an event (any status). Used to bulk-check invite involvement. */
export async function getAllEventInvites(eventId: string): Promise<EventPlusOneInvite[]> {
  return db.select().from(eventPlusOneInvites)
    .where(eq(eventPlusOneInvites.eventId, eventId));
}

/** All accepted pairings for an event (used by lottery + waitlist logic). */
export async function getAcceptedPairingsForEvent(eventId: string): Promise<EventPlusOneInvite[]> {
  return db.select().from(eventPlusOneInvites)
    .where(and(
      eq(eventPlusOneInvites.eventId, eventId),
      eq(eventPlusOneInvites.status, 'accepted'),
    ));
}

/** Create a new +1 invite. */
export async function createPlusOneInvite(data: NewEventPlusOneInvite): Promise<EventPlusOneInvite> {
  const [row] = await db.insert(eventPlusOneInvites).values(data).returning();
  return row;
}

/** Update invite status (pending → accepted). */
export async function updatePlusOneInviteStatus(
  id: string,
  status: 'pending' | 'accepted',
): Promise<void> {
  await db.update(eventPlusOneInvites).set({ status }).where(eq(eventPlusOneInvites.id, id));
}

/** Delete an invite (decline or dissolve). */
export async function deletePlusOneInvite(id: string): Promise<void> {
  await db.delete(eventPlusOneInvites).where(eq(eventPlusOneInvites.id, id));
}

// ============================================================================
// Event Edit Log Queries
// ============================================================================

export async function createEventEditLogEntry(data: NewEventEditLog) {
  await db.insert(eventEditLog).values(data);
}

export async function getEventEditLog(eventId: string) {
  return db.select({
    id: eventEditLog.id,
    changedAt: eventEditLog.changedAt,
    changes: eventEditLog.changes,
    changedBy: {
      id: users.id,
      name: users.name,
    },
  })
    .from(eventEditLog)
    .innerJoin(users, eq(eventEditLog.changedBy, users.id))
    .where(eq(eventEditLog.eventId, eventId))
    .orderBy(desc(eventEditLog.changedAt));
}
