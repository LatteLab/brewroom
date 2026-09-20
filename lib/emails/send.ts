/**
 * Central transactional-email helper.
 *
 * Two entrypoints:
 *   - sendTransactional({ template, recipient, payload, ... })
 *       Inserts an outbox row, attempts immediate send, returns row id.
 *       Never throws - server actions must continue regardless of email outcome.
 *   - drainOutbox(limit)
 *       Used by cron worker. Claims due `queued` rows under a 5-min lock,
 *       renders + sends them, marks sent/failed with backoff.
 */

import { Resend } from 'resend';
import { db } from '@/lib/db';
import { emailOutbox } from '@/lib/db/schema';
import { eq, and, sql, or, inArray, lte, lt, isNull } from 'drizzle-orm';
import type { EmailOutbox, EmailOutboxStatus } from '@/lib/db/schema';
import { getSubject, renderTransactionalEmail } from './transactional-renderer';
import type { TransactionalTemplate, PayloadFor, PayloadByTemplate } from './templates';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_DEFAULT = 'Latte Lab <noreply@lattelab.org>';
const FROM_AUTOMATED_DEFAULT = 'Latte Lab <noreply@lattelab.org>';
const REPLY_DOMAIN_DEFAULT = 'lattelab.org';

// Templates that look more "system-ish" - use the noreply From so replies don't go to the
// human exec inbox. The reply-to address is still tokenized so threading works regardless.
const AUTOMATED_TEMPLATES = new Set<string>([
  'event_reminder',
  'photos_available',
  'lottery_not_selected',
  'waitlist_joined',
]);

function fromAddress(template?: string | null): string {
  if (template && AUTOMATED_TEMPLATES.has(template)) {
    return process.env.EMAIL_FROM_AUTOMATED || FROM_AUTOMATED_DEFAULT;
  }
  return process.env.EMAIL_FROM || FROM_DEFAULT;
}

function replyDomain(): string {
  return process.env.EMAIL_REPLY_DOMAIN || REPLY_DOMAIN_DEFAULT;
}

function buildReplyAddress(outboxId: string): string {
  return `reply+${outboxId}@${replyDomain()}`;
}

function buildMessageId(outboxId: string): string {
  // RFC 5322 angle-bracketed Message-ID. Domain matches sending domain so DKIM is consistent.
  return `<outbox/${outboxId}@${replyDomain()}>`;
}

function nextBackoffMs(attemptCount: number): number | null {
  // 1m, 5m, 30m, 2h - give up after attempt 4.
  const ladder = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3600_000];
  const index = Math.max(0, attemptCount - 1);
  return index < ladder.length ? ladder[index] : null;
}

export interface SendArgs<T extends TransactionalTemplate> {
  template: T;
  recipient: { userId?: string | null; email: string; name?: string | null };
  payload: PayloadFor<T>;
  scheduledFor?: Date;
  /**
   * Insert the outbox row and return immediately. Bulk fan-outs should use this so
   * user/admin requests do not wait on dozens of Resend API calls.
   */
  queueOnly?: boolean;
  idempotencyKey?: string;
  relatedEventId?: string | null;
  relatedRegistrationId?: string | null;
  /** Set when this is a reply to a specific inbound email - links the rows for UI threading. */
  replyToInboundId?: string | null;
  /**
   * Extra raw headers to set on the outgoing message. Used by replies to set In-Reply-To and
   * References so the recipient's mail client threads the conversation. Header name casing
   * matches RFC 5322 (Resend passes them through).
   */
  extraHeaders?: Record<string, string>;
  /** Override the subject if the template's default isn't appropriate (e.g., "Re: ..." replies). */
  subjectOverride?: string;
}

export interface SendResult {
  id: string | null;
  status: 'sent' | 'queued' | 'failed' | 'duplicate';
}

/**
 * Render + send a single transactional email. Inserts an outbox row first.
 * Honors idempotencyKey: a duplicate INSERT no-ops and returns the existing row.
 */
export async function sendTransactional<T extends TransactionalTemplate>(
  args: SendArgs<T>,
): Promise<SendResult> {
  try {
    return await insertAndMaybeSendTransactional(args);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[email/send] failed to enqueue ${args.template} -> ${args.recipient.email}:`, message);
    return { id: null, status: 'failed' };
  }
}

async function insertAndMaybeSendTransactional<T extends TransactionalTemplate>(
  args: SendArgs<T>,
): Promise<SendResult> {
  const now = new Date();
  const scheduledFor = args.scheduledFor ?? now;
  const subject = args.subjectOverride ?? getSubject(args.template, args.payload);

  // Step 1: insert (or no-op on idempotency conflict).
  let row: EmailOutbox | undefined;
  if (args.idempotencyKey) {
    // INSERT ... ON CONFLICT DO NOTHING relies on the partial unique index on idempotency_key.
    const inserted = await db
      .insert(emailOutbox)
      .values({
        kind: 'transactional',
        template: args.template,
        recipientUserId: args.recipient.userId ?? null,
        recipientEmail: args.recipient.email,
        subject,
        payload: args.payload as unknown as Record<string, unknown>,
        status: 'queued',
        idempotencyKey: args.idempotencyKey,
        relatedEventId: args.relatedEventId ?? null,
        relatedRegistrationId: args.relatedRegistrationId ?? null,
        replyToInboundId: args.replyToInboundId ?? null,
        extraHeaders: args.extraHeaders ?? null,
        scheduledFor,
      })
      .onConflictDoNothing({ target: emailOutbox.idempotencyKey })
      .returning();

    if (inserted.length === 0) {
      // Existing row - return its id.
      const existing = await db
        .select({ id: emailOutbox.id, status: emailOutbox.status })
        .from(emailOutbox)
        .where(eq(emailOutbox.idempotencyKey, args.idempotencyKey))
        .limit(1);
      if (existing.length > 0) {
        return { id: existing[0].id, status: 'duplicate' };
      }
      // Should never happen - fall through and try a fresh insert below.
    } else {
      row = inserted[0];
    }
  }

  if (!row) {
    const inserted = await db
      .insert(emailOutbox)
      .values({
        kind: 'transactional',
        template: args.template,
        recipientUserId: args.recipient.userId ?? null,
        recipientEmail: args.recipient.email,
        subject,
        payload: args.payload as unknown as Record<string, unknown>,
        status: 'queued',
        idempotencyKey: args.idempotencyKey ?? null,
        relatedEventId: args.relatedEventId ?? null,
        relatedRegistrationId: args.relatedRegistrationId ?? null,
        replyToInboundId: args.replyToInboundId ?? null,
        extraHeaders: args.extraHeaders ?? null,
        scheduledFor,
      })
      .returning();
    row = inserted[0];
  }

  // Step 2: if scheduled in the future or explicitly queued, leave it for the worker.
  if (args.queueOnly || row.scheduledFor.getTime() > now.getTime()) {
    return { id: row.id, status: 'queued' };
  }

  // Step 3: try sending now (inline happy path).
  return attemptSend(row);
}

/**
 * RenderError marks deterministic failures (template missing data, malformed payload).
 * These should NOT be retried - same input = same failure forever.
 */
class RenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RenderError';
  }
}

async function attemptSend(row: EmailOutbox, options: { alreadyClaimed?: boolean } = {}): Promise<SendResult> {
  const replyAddress = buildReplyAddress(row.id);
  const messageId = buildMessageId(row.id);
  const newAttemptCount = row.attemptCount + 1;
  const now = new Date();
  const lockExpiry = new Date(now.getTime() - 5 * 60_000);

  const claimValues = {
    status: 'sending' as EmailOutboxStatus,
    lockedAt: now,
    replyAddress,
    messageId,
    attemptCount: newAttemptCount,
    updatedAt: now,
  };

  if (options.alreadyClaimed) {
    await db
      .update(emailOutbox)
      .set(claimValues)
      .where(eq(emailOutbox.id, row.id));
  } else {
    const claimed = await db
      .update(emailOutbox)
      .set(claimValues)
      .where(
        and(
          eq(emailOutbox.id, row.id),
          lte(emailOutbox.scheduledFor, now),
          or(isNull(emailOutbox.nextAttemptAt), lte(emailOutbox.nextAttemptAt, now))!,
          or(
            and(
              eq(emailOutbox.status, 'queued'),
              or(isNull(emailOutbox.lockedAt), lt(emailOutbox.lockedAt, lockExpiry))!,
            )!,
            and(
              eq(emailOutbox.status, 'sending'),
              lt(emailOutbox.lockedAt, lockExpiry),
            )!,
          )!,
        ),
      )
      .returning({ id: emailOutbox.id });

    if (claimed.length === 0) {
      return { id: row.id, status: 'duplicate' };
    }
  }

  // Render first - if it throws, it's a bug, not a transient failure.
  let html: string;
  try {
    if (!row.template) throw new Error('Missing template');
    html = renderTransactionalEmail(
      row.template as TransactionalTemplate,
      row.payload as unknown as PayloadByTemplate[TransactionalTemplate],
    ).html;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(emailOutbox)
      .set({
        status: 'failed',
        lastError: `Render failed (no retry): ${message}`.slice(0, 1000),
        nextAttemptAt: null,
        lockedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(emailOutbox.id, row.id));
    console.error(`[email/send] render failed for ${row.template}:`, message);
    return { id: row.id, status: 'failed' };
  }

  try {
    // Merge required Message-ID with any per-row extra headers (e.g. In-Reply-To for replies).
    // Our Message-ID always wins so threading on subsequent replies still works.
    const headers: Record<string, string> = {
      ...(row.extraHeaders ?? {}),
      'Message-ID': messageId,
    };

    const { data, error } = await resend.emails.send(
      {
        from: fromAddress(row.template),
        to: row.recipientEmail,
        replyTo: replyAddress,
        subject: row.subject,
        html,
        headers,
      },
      { idempotencyKey: `outbox/${row.id}` },
    );

    if (error) throw new Error(error.message);

    await db
      .update(emailOutbox)
      .set({
        status: 'sent',
        providerMessageId: data?.id ?? null,
        sentAt: new Date(),
        lockedAt: null,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(emailOutbox.id, row.id));

    return { id: row.id, status: 'sent' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const backoffMs = nextBackoffMs(newAttemptCount);
    const nextAttemptAt = backoffMs !== null ? new Date(Date.now() + backoffMs) : null;
    const finalStatus: EmailOutboxStatus = nextAttemptAt ? 'queued' : 'failed';

    await db
      .update(emailOutbox)
      .set({
        status: finalStatus,
        lastError: message.slice(0, 1000),
        // Bump scheduledFor so drain query (which filters on scheduled_for <= now) actually
        // respects the backoff window - without this, the next drain re-claims immediately.
        scheduledFor: nextAttemptAt ?? row.scheduledFor,
        nextAttemptAt,
        lockedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(emailOutbox.id, row.id));

    console.error(`[email/send] ${row.template} -> ${row.recipientEmail} failed (attempt ${newAttemptCount}):`, message);
    return { id: row.id, status: finalStatus === 'failed' ? 'failed' : 'queued' };
  }
}

// fromAddress now accepts an optional template hint - purely-automated templates can use a
// noreply sender to keep the human exec inbox clean.
void RenderError; // exported for future use

/**
 * Cron worker entrypoint. Claims due outbox rows under a 5-minute lock,
 * renders + sends them, returns counts.
 */
export async function drainOutbox(limit = 100): Promise<{
  processed: number;
  sent: number;
  failed: number;
}> {
  const now = new Date();
  const lockExpiry = new Date(now.getTime() - 5 * 60_000);
  // ISO strings for raw SQL parameters (postgres-js rejects Date inside sql tagged templates).
  const nowIso = now.toISOString();
  const lockExpiryIso = lockExpiry.toISOString();

  // Step 1 - claim due IDs atomically with FOR UPDATE SKIP LOCKED. Returning only ids
  // sidesteps the snake_case-vs-camelCase mismatch from raw SQL `RETURNING *`.
  // We accept rows in two cases:
  //   (a) status='queued' AND scheduled_for <= now
  //   (b) status='sending' AND locked_at < lockExpiry  (stuck rows from crashed workers)
  // We also honor next_attempt_at if set (backoff).
  const claimedIds = await db.execute<{ id: string }>(sql`
    UPDATE email_outbox
       SET locked_at = ${nowIso}::timestamp,
           updated_at = ${nowIso}::timestamp,
           status = 'sending'
     WHERE id IN (
       SELECT id FROM email_outbox
        WHERE (
                (status = 'queued' AND scheduled_for <= ${nowIso}::timestamp)
                OR (status = 'sending' AND locked_at IS NOT NULL AND locked_at < ${lockExpiryIso}::timestamp)
              )
          AND (next_attempt_at IS NULL OR next_attempt_at <= ${nowIso}::timestamp)
          AND (locked_at IS NULL OR locked_at < ${lockExpiryIso}::timestamp)
        ORDER BY scheduled_for ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
     )
     RETURNING id
  `);

  // postgres-js returns the rows array directly on the result. Be defensive about shape.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const idRows: { id: string }[] = (claimedIds as any).rows ?? (claimedIds as unknown as { id: string }[]);
  if (!idRows || idRows.length === 0) {
    return { processed: 0, sent: 0, failed: 0 };
  }
  const ids = idRows.map((r) => r.id);

  // Step 2 - re-fetch full rows via Drizzle so we get camelCase, properly-typed values.
  // attemptSend mutates row state directly; we don't re-claim because step 1 already did that.
  const rows = await db
    .select()
    .from(emailOutbox)
    .where(inArray(emailOutbox.id, ids));

  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    // Subtract 1 from attemptCount - step 1 already set status=sending, but didn't bump attempts.
    // attemptSend will do attemptCount + 1 in its own UPDATE. We pass the row as-is.
    const result = await attemptSend(row, { alreadyClaimed: true });
    if (result.status === 'sent') sent++;
    else if (result.status === 'failed') failed++;
  }

  return { processed: rows.length, sent, failed };
}

/**
 * Manual retry of a single failed outbox row from the admin UI.
 */
export async function retryOutboxRow(rowId: string): Promise<SendResult> {
  const [row] = await db
    .select()
    .from(emailOutbox)
    .where(and(eq(emailOutbox.id, rowId), or(eq(emailOutbox.status, 'failed'), eq(emailOutbox.status, 'queued'))!))
    .limit(1);
  if (!row) throw new Error('Outbox row not found or not retryable');
  // Reset to queued state and try again.
  await db
    .update(emailOutbox)
    .set({
      status: 'queued',
      lockedAt: null,
      nextAttemptAt: null,
      scheduledFor: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(emailOutbox.id, rowId));
  const fresh = {
    ...row,
    status: 'queued' as EmailOutboxStatus,
    lockedAt: null,
    nextAttemptAt: null,
    scheduledFor: new Date(),
  };
  return attemptSend(fresh);
}

// Helpful re-export for callers
export type { TransactionalTemplate, PayloadFor };
