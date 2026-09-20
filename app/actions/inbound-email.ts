'use server';

import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { inboundEmails, emailOutbox, emailBlasts, events } from '@/lib/db/schema';
import { desc, eq, and, sql, type SQL } from 'drizzle-orm';
import { sendTransactional } from '@/lib/emails/send';
import { sanitize } from '@/lib/sanitize';

export interface InboxFilters {
  threadingSource?: string;
  relatedEventId?: string;
  replyToBlastId?: string;
  fromEmail?: string;
}

export async function getInboundEmailsAction(filters: InboxFilters = {}, limit = 100) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const conditions: SQL[] = [];
  if (filters.threadingSource) conditions.push(eq(inboundEmails.threadingSource, filters.threadingSource as 'reply_address' | 'in_reply_to' | 'references' | 'manual' | 'none'));
  if (filters.relatedEventId) conditions.push(eq(inboundEmails.relatedEventId, filters.relatedEventId));
  if (filters.replyToBlastId) conditions.push(eq(inboundEmails.replyToBlastId, filters.replyToBlastId));
  if (filters.fromEmail) conditions.push(eq(inboundEmails.fromEmail, filters.fromEmail.toLowerCase()));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  return db
    .select({
      id: inboundEmails.id,
      fromEmail: inboundEmails.fromEmail,
      fromName: inboundEmails.fromName,
      subject: inboundEmails.subject,
      threadingSource: inboundEmails.threadingSource,
      replyToOutboxId: inboundEmails.replyToOutboxId,
      replyToBlastId: inboundEmails.replyToBlastId,
      relatedEventId: inboundEmails.relatedEventId,
      eventName: events.name,
      blastSubject: emailBlasts.subject,
      outboxSubject: emailOutbox.subject,
      forwardedTo: inboundEmails.forwardedTo,
      forwardStatus: inboundEmails.forwardStatus,
      forwardedAt: inboundEmails.forwardedAt,
      createdAt: inboundEmails.createdAt,
    })
    .from(inboundEmails)
    .leftJoin(events, eq(events.id, inboundEmails.relatedEventId))
    .leftJoin(emailBlasts, eq(emailBlasts.id, inboundEmails.replyToBlastId))
    .leftJoin(emailOutbox, eq(emailOutbox.id, inboundEmails.replyToOutboxId))
    .where(where)
    .orderBy(desc(inboundEmails.createdAt))
    .limit(limit);
}

export async function getInboundEmailDetailAction(id: string) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const [row] = await db.select().from(inboundEmails).where(eq(inboundEmails.id, id)).limit(1);
  return row ?? null;
}

export async function getInboundCountStatsAction() {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const [stats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      threaded: sql<number>`count(*) filter (where threading_source <> 'none')::int`,
      orphaned: sql<number>`count(*) filter (where threading_source = 'none')::int`,
    })
    .from(inboundEmails);

  return stats;
}

const REPLY_BODY_MAX = 50_000; // 50KB of HTML - generous, prevents accidental megabyte payloads

/**
 * Reply to an inbound email from the admin UI. Sends from `exec@lattelab.org`, preserves
 * threading via In-Reply-To + References, and logs an outbox row linked to the inbound.
 *
 * The recipient's Reply-To is the tokenized address pointing to the new outbox row, so if
 * they reply again, the chain continues to thread back to us.
 */
export async function replyToInboundEmailAction(
  inboundId: string,
  rawHtml: string,
): Promise<{ outboxId: string | null; status: string }> {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const trimmed = rawHtml.trim();
  if (!trimmed) throw new Error('Reply body is empty');
  if (trimmed.length > REPLY_BODY_MAX) {
    throw new Error('Reply is too long');
  }

  const [inbound] = await db
    .select()
    .from(inboundEmails)
    .where(eq(inboundEmails.id, inboundId))
    .limit(1);
  if (!inbound) throw new Error('Inbound email not found');

  // Sanitize once before persisting in payload - payload is rendered as raw HTML in the email
  // template, so anything malicious would otherwise reach recipients.
  const safeHtml = sanitize(trimmed);

  // Build threading headers per RFC 5322 Section 3.6.4. References = (existing References) + In-Reply-To.
  const inReplyTo = inbound.messageId ?? undefined;
  const references = [inbound.references, inbound.messageId]
    .filter((v): v is string => Boolean(v))
    .join(' ');

  const extraHeaders: Record<string, string> = {};
  if (inReplyTo) extraHeaders['In-Reply-To'] = inReplyTo;
  if (references) extraHeaders['References'] = references;

  const subject = inbound.subject
    ? inbound.subject.toLowerCase().startsWith('re:')
      ? inbound.subject
      : `Re: ${inbound.subject}`
    : 'Re: (no subject)';

  const result = await sendTransactional({
    template: 'admin_reply',
    recipient: { email: inbound.fromEmail, name: inbound.fromName ?? null },
    payload: { bodyHtml: safeHtml, senderName: session.user.name ?? null },
    subjectOverride: subject,
    replyToInboundId: inbound.id,
    relatedEventId: inbound.relatedEventId,
    extraHeaders,
  });

  revalidatePath(`/admin/email/inbox/${inboundId}`);
  revalidatePath('/admin/email/inbox');
  revalidatePath('/admin/email/log');
  return { outboxId: result.id, status: result.status };
}

/** Number of inbound replies threaded back to a given blast - for blast detail UI badge. */
export async function getInboundCountForBlastAction(blastId: string) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(inboundEmails)
    .where(eq(inboundEmails.replyToBlastId, blastId));
  return row?.count ?? 0;
}

/** Returns prior admin replies to a given inbound email (for the inbox detail "history" panel). */
export async function getRepliesForInboundAction(inboundId: string) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  return db
    .select({
      id: emailOutbox.id,
      subject: emailOutbox.subject,
      status: emailOutbox.status,
      sentAt: emailOutbox.sentAt,
      createdAt: emailOutbox.createdAt,
      lastError: emailOutbox.lastError,
    })
    .from(emailOutbox)
    .where(eq(emailOutbox.replyToInboundId, inboundId))
    .orderBy(desc(emailOutbox.createdAt));
}
