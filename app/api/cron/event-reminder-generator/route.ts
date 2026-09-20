import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const maxDuration = 60;

import {
  eventEmailReminderRules,
  eventEmailReminderSends,
  events,
  eventRegistrations,
  users,
} from '@/lib/db/schema';
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { sendTransactional } from '@/lib/emails/send';
import { buildEventSummary } from '@/lib/emails/templates';

/**
 * Reminder generator. Runs hourly. Finds registrations whose
 *   eventStart - rule.offsetMinutes
 * is due within the next hour or overdue within the 48h lookback, queues an outbox row for each,
 * then records the send in `event_email_reminder_sends`. Idempotency is enforced by both the
 * outbox idempotency key and the unique (registrationId, offsetMinutes) tracking row.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const expected = process.env.CRON_SECRET;
  if (!expected || authHeader !== `Bearer ${expected}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60_000);
    const lookbackStart = new Date(now.getTime() - 48 * 60 * 60_000);
    const oneHourFromNowIso = oneHourFromNow.toISOString();
    const lookbackStartIso = lookbackStart.toISOString();

    const candidates = await db
      .select({
        ruleOffset: eventEmailReminderRules.offsetMinutes,
        eventId: events.id,
        eventName: events.name,
        eventDate: events.date,
        eventEndDate: events.endDate,
        eventLocation: events.location,
        eventCoverImage: events.coverImage,
        registrationId: eventRegistrations.id,
        userId: users.id,
        userName: users.name,
        userEmail: users.email,
      })
      .from(eventEmailReminderRules)
      .innerJoin(events, eq(events.id, eventEmailReminderRules.eventId))
      .innerJoin(eventRegistrations, eq(eventRegistrations.eventId, events.id))
      .innerJoin(users, eq(users.id, eventRegistrations.userId))
      .where(
        and(
          eq(eventEmailReminderRules.enabled, true),
          inArray(events.status, ['open', 'closed']),
          inArray(eventRegistrations.status, ['registered', 'selected', 'checked_in']),
          isNotNull(users.email),
          sql`${events.date} - (${eventEmailReminderRules.offsetMinutes} * interval '1 minute') >= ${lookbackStartIso}::timestamp`,
          sql`${events.date} - (${eventEmailReminderRules.offsetMinutes} * interval '1 minute') < ${oneHourFromNowIso}::timestamp`,
          sql`NOT EXISTS (
            SELECT 1 FROM ${eventEmailReminderSends} s
             WHERE s.registration_id = ${eventRegistrations.id}
               AND s.offset_minutes = ${eventEmailReminderRules.offsetMinutes}
          )`,
        ),
      );

    let queued = 0;
    for (const c of candidates) {
      const eventSummary = buildEventSummary({
        id: c.eventId,
        name: c.eventName,
        date: c.eventDate,
        endDate: c.eventEndDate,
        location: c.eventLocation,
        coverImage: c.eventCoverImage,
      });

      const result = await sendTransactional({
        template: 'event_reminder',
        recipient: { userId: c.userId, email: c.userEmail!, name: c.userName },
        payload: {
          userName: c.userName,
          event: eventSummary,
          humanOffsetLabel: humanOffset(c.ruleOffset),
        },
        scheduledFor: new Date(c.eventDate.getTime() - c.ruleOffset * 60_000),
        idempotencyKey: `reminder:${c.registrationId}:${c.ruleOffset}`,
        relatedEventId: c.eventId,
        relatedRegistrationId: c.registrationId,
      });

      if (!result.id) {
        // Do not insert a reminder-send row for an email that never reached the outbox.
        continue;
      }

      const inserted = await db
        .insert(eventEmailReminderSends)
        .values({
          registrationId: c.registrationId,
          eventId: c.eventId,
          offsetMinutes: c.ruleOffset,
          outboxId: result.id,
        })
        .onConflictDoNothing()
        .returning({ id: eventEmailReminderSends.id });

      if (inserted.length > 0 && result.status !== 'failed') queued++;
    }

    return NextResponse.json({ ok: true, queued });
  } catch (error) {
    console.error('[cron/event-reminder-generator] failed:', error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'unknown' },
      { status: 500 },
    );
  }
}

function humanOffset(minutes: number): string {
  if (minutes >= 1440) {
    const days = Math.round(minutes / 1440);
    return days === 1 ? 'tomorrow' : `in ${days} days`;
  }
  if (minutes >= 60) {
    const hours = Math.round(minutes / 60);
    return hours === 1 ? 'in 1 hour' : `in ${hours} hours`;
  }
  return `in ${minutes} minutes`;
}
