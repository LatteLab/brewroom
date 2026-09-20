import 'server-only';

import type { Event } from '@/lib/db/schema';
import type { RegistrationRow } from '@/lib/types/event';
import { sendTransactional, type SendResult } from '@/lib/emails/send';
import { buildEventSummary, type EventChangedPayload } from '@/lib/emails/templates';

type RegistrationWithEmail = RegistrationRow & {
  user: RegistrationRow['user'] & { email: string };
};

type SendSummary = {
  newlySent: number;
  duplicate: number;
  errored: number;
  total: number;
};

function withEmail(row: RegistrationRow): row is RegistrationWithEmail {
  return Boolean(row.user.email);
}

function summarize(results: PromiseSettledResult<SendResult>[], total: number): SendSummary {
  let newlySent = 0;
  let duplicate = 0;
  let errored = 0;

  for (const result of results) {
    if (result.status === 'rejected') {
      errored++;
      continue;
    }

    if (result.value.status === 'duplicate') duplicate++;
    else if (result.value.status === 'sent' || result.value.status === 'queued') newlySent++;
    else errored++;
  }

  return { newlySent, duplicate, errored, total };
}

function formatEventChangeValue(event: Event, field: string, value: unknown): string | null {
  if (value == null) return null;

  if (field === 'date' || field === 'endDate') {
    const date = value instanceof Date ? value : new Date(String(value));
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleString('en-US', {
        timeZone: event.timezone ?? 'America/New_York',
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    }
  }

  return String(value);
}

export async function notifyEventChangedRegistrants(
  event: Event,
  recipients: RegistrationRow[],
  changes: Partial<Record<keyof Event, { old: unknown; new: unknown }>>,
): Promise<SendSummary> {
  const eventSummary = buildEventSummary(event);
  const stamp = Date.now();
  const payloadChanges: EventChangedPayload['changes'] = Object.entries(changes).map(
    ([field, change]) => ({
      field,
      oldValue: formatEventChangeValue(event, field, change?.old),
      newValue: formatEventChangeValue(event, field, change?.new),
    }),
  );
  const deliverable = recipients.filter(withEmail);

  const results = await Promise.allSettled(
    deliverable.map((row) =>
      sendTransactional({
        template: 'event_changed',
        recipient: { userId: row.user.id, email: row.user.email, name: row.user.name },
        payload: { userName: row.user.name, event: eventSummary, changes: payloadChanges },
        idempotencyKey: `event_changed:${row.registration.id}:${stamp}`,
        relatedEventId: event.id,
        relatedRegistrationId: row.registration.id,
        queueOnly: true,
      }),
    ),
  );

  return summarize(results, deliverable.length);
}

export async function notifyWaitlistPromoted(event: Event, rows: RegistrationRow[]): Promise<SendSummary> {
  const eventSummary = buildEventSummary(event);
  const deliverable = rows.filter(withEmail);
  const results = await Promise.allSettled(
    deliverable.map((row) =>
      sendTransactional({
        template: 'waitlist_promoted',
        recipient: { userId: row.user.id, email: row.user.email, name: row.user.name },
        payload: { userName: row.user.name, event: eventSummary },
        idempotencyKey: `waitlist_promoted:${row.registration.id}`,
        relatedEventId: event.id,
        relatedRegistrationId: row.registration.id,
        queueOnly: true,
      }),
    ),
  );
  return summarize(results, deliverable.length);
}

export async function notifyLotteryResults(
  event: Event,
  selectedRows: RegistrationRow[],
  notSelectedRows: RegistrationRow[],
): Promise<SendSummary> {
  const eventSummary = buildEventSummary(event);
  const jobs = [
    ...selectedRows.filter(withEmail).map((row) =>
      sendTransactional({
        template: 'lottery_selected',
        recipient: { userId: row.user.id, email: row.user.email, name: row.user.name },
        payload: { userName: row.user.name, event: eventSummary },
        idempotencyKey: `lottery_selected:${row.registration.id}`,
        relatedEventId: event.id,
        relatedRegistrationId: row.registration.id,
        queueOnly: true,
      }),
    ),
    ...notSelectedRows.filter(withEmail).map((row) =>
      sendTransactional({
        template: 'lottery_not_selected',
        recipient: { userId: row.user.id, email: row.user.email, name: row.user.name },
        payload: { userName: row.user.name, event: eventSummary },
        idempotencyKey: `lottery_not_selected:${row.registration.id}`,
        relatedEventId: event.id,
        relatedRegistrationId: row.registration.id,
        queueOnly: true,
      }),
    ),
  ];
  const results = await Promise.allSettled(jobs);
  return summarize(results, jobs.length);
}

export async function notifyEventCancelledRegistrants(
  event: Event,
  rows: RegistrationRow[],
  reason?: string | null,
): Promise<SendSummary> {
  const eventSummary = buildEventSummary(event);
  const deliverable = rows.filter(withEmail);
  const results = await Promise.allSettled(
    deliverable.map((row) =>
      sendTransactional({
        template: 'event_cancelled',
        recipient: { userId: row.user.id, email: row.user.email, name: row.user.name },
        payload: { userName: row.user.name, event: eventSummary, reason: reason ?? null },
        idempotencyKey: `event_cancelled:${row.registration.id}`,
        relatedEventId: event.id,
        relatedRegistrationId: row.registration.id,
        queueOnly: true,
      }),
    ),
  );
  return summarize(results, deliverable.length);
}

export async function notifyRegistrationApproved(event: Event, rows: RegistrationRow[]): Promise<SendSummary> {
  const eventSummary = buildEventSummary(event);
  const deliverable = rows.filter(withEmail);
  const results = await Promise.allSettled(
    deliverable.map((row) =>
      sendTransactional({
        template: 'registration_approved',
        recipient: { userId: row.user.id, email: row.user.email, name: row.user.name },
        payload: { userName: row.user.name, event: eventSummary },
        idempotencyKey: `registration_approved:${row.registration.id}`,
        relatedEventId: event.id,
        relatedRegistrationId: row.registration.id,
        queueOnly: deliverable.length > 1,
      }),
    ),
  );
  return summarize(results, deliverable.length);
}

export async function notifyRegistrationRejected(event: Event, rows: RegistrationRow[]): Promise<SendSummary> {
  const eventSummary = buildEventSummary(event);
  const deliverable = rows.filter(withEmail);
  const results = await Promise.allSettled(
    deliverable.map((row) =>
      sendTransactional({
        template: 'registration_rejected',
        recipient: { userId: row.user.id, email: row.user.email, name: row.user.name },
        payload: { userName: row.user.name, event: eventSummary },
        idempotencyKey: `registration_rejected:${row.registration.id}`,
        relatedEventId: event.id,
        relatedRegistrationId: row.registration.id,
        queueOnly: deliverable.length > 1,
      }),
    ),
  );
  return summarize(results, deliverable.length);
}

export async function notifyPhotoAlbumAvailable(
  event: Event,
  rows: RegistrationRow[],
  photoCount: number,
): Promise<SendSummary> {
  const eventSummary = buildEventSummary(event);
  const deliverable = rows.filter(withEmail);
  const results = await Promise.allSettled(
    deliverable.map((row) =>
      sendTransactional({
        template: 'photos_available',
        recipient: { userId: row.user.id, email: row.user.email, name: row.user.name },
        payload: { userName: row.user.name, event: eventSummary, photoCount },
        idempotencyKey: `photos_available:${row.registration.id}`,
        relatedEventId: event.id,
        relatedRegistrationId: row.registration.id,
        queueOnly: true,
      }),
    ),
  );
  return summarize(results, deliverable.length);
}

export async function resendRegistrationConfirmations(event: Event, rows: RegistrationRow[]): Promise<SendSummary> {
  const eventSummary = buildEventSummary(event);
  const stamp = Date.now();
  const deliverable = rows.filter(withEmail);
  const results = await Promise.allSettled(
    deliverable.map((row) =>
      sendTransactional({
        template: 'registration_approved',
        recipient: { userId: row.user.id, email: row.user.email, name: row.user.name },
        payload: { userName: row.user.name, event: eventSummary },
        idempotencyKey: `resend_confirmation:${row.registration.id}:${stamp}`,
        relatedEventId: event.id,
        relatedRegistrationId: row.registration.id,
        queueOnly: true,
      }),
    ),
  );
  return summarize(results, deliverable.length);
}
