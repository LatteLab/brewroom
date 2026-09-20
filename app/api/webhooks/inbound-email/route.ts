import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { Webhook } from 'svix';
import { db } from '@/lib/db';
import { inboundEmails, emailOutbox, emailBlasts, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { InboundForwardStatus, InboundThreadingSource } from '@/lib/db/schema';

export const runtime = 'nodejs';
export const maxDuration = 60;

const resend = new Resend(process.env.RESEND_API_KEY);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FORWARD_TO_DEFAULT = 'lattelab-exec@mit.edu';
const FROM_AUTOMATED_DEFAULT = 'Latte Lab <noreply@lattelab.org>';

/**
 * Resend Inbound webhook.
 *
 * The webhook payload is metadata-only. Full body, headers, and attachment metadata are fetched
 * from the Receiving API before we persist the inbox row. Every inbound email is also forwarded
 * to the exec mailbox, but forwarding failure never prevents the audit row from being inserted.
 */
export async function POST(req: NextRequest) {
  try {
    const svixId = req.headers.get('svix-id');
    const svixTimestamp = req.headers.get('svix-timestamp');
    const svixSignature = req.headers.get('svix-signature');

    if (!svixId || !svixTimestamp || !svixSignature) {
      return NextResponse.json({ error: 'Missing signature headers' }, { status: 401 });
    }

    const secret = process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
    if (!secret) {
      console.error('[webhook/inbound-email] Missing INBOUND_EMAIL_WEBHOOK_SECRET');
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    const rawBody = await req.text();
    const wh = new Webhook(secret);
    let payload: unknown;
    try {
      payload = wh.verify(rawBody, {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      });
    } catch {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const metadata = parseWebhookMetadata(payload);
    if (!metadata) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const fullEmail = await fetchReceivedEmail(metadata.providerEmailId);
    const parsed = mergeInbound(metadata, fullEmail);

    const thread = await resolveThread(parsed);
    const relatedUserId = await resolveRelatedUserId(parsed.fromEmail);

    const rawPayloadBase = {
      webhook: payload,
      fetchedContent: Boolean(fullEmail),
    } as Record<string, unknown>;

    const inserted = await db
      .insert(inboundEmails)
      .values({
        providerEmailId: parsed.providerEmailId,
        fromEmail: parsed.fromEmail,
        fromName: parsed.fromName ?? null,
        toEmail: parsed.toEmail,
        subject: parsed.subject ?? null,
        bodyText: parsed.bodyText ?? null,
        bodyHtml: parsed.bodyHtml ?? null,
        headers: parsed.headers ?? null,
        attachmentsMeta: parsed.attachmentsMeta ?? null,
        messageId: parsed.messageId ?? null,
        inReplyTo: parsed.inReplyTo ?? null,
        references: parsed.references ?? null,
        threadingSource: thread.threadingSource,
        replyToOutboxId: thread.replyToOutboxId,
        replyToBlastId: thread.replyToBlastId,
        relatedEventId: thread.relatedEventId,
        relatedUserId,
        forwardedTo: null,
        forwardStatus: 'not_attempted',
        forwardedAt: null,
        rawPayload: rawPayloadBase,
      })
      .onConflictDoNothing({ target: inboundEmails.providerEmailId })
      .returning({ id: inboundEmails.id });

    const inboundId = inserted[0]?.id ?? await getRetryableInboundId(parsed.providerEmailId);
    if (!inboundId) {
      return NextResponse.json({ ok: true, dedupe: true, forwardStatus: 'sent' });
    }

    const forward = await forwardToExec(metadata.providerEmailId, parsed);
    await db
      .update(inboundEmails)
      .set({
        forwardedTo: forward.forwardedTo,
        forwardStatus: forward.forwardStatus,
        forwardedAt: forward.forwardedAt,
        rawPayload: {
          ...rawPayloadBase,
          forwardError: forward.errorMessage ?? null,
        },
      })
      .where(eq(inboundEmails.id, inboundId));

    return NextResponse.json({
      ok: true,
      dedupe: inserted.length === 0,
      threadingSource: thread.threadingSource,
      forwardStatus: forward.forwardStatus,
    });
  } catch (error) {
    console.error('[webhook/inbound-email] failed:', error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

interface InboundMetadata {
  providerEmailId: string;
  fromRaw?: string;
  toRaw: string[];
  subject?: string;
  messageId?: string;
  attachmentsMeta?: AttachmentMeta[];
}

interface FullReceivedEmail {
  from?: string;
  to?: string[];
  subject?: string;
  bodyText?: string | null;
  bodyHtml?: string | null;
  headers?: Record<string, string>;
  messageId?: string;
  attachmentsMeta?: AttachmentMeta[];
}

interface AttachmentMeta {
  id?: string;
  filename: string;
  contentType: string;
  size: number;
  contentId?: string | null;
  contentDisposition?: string | null;
}

interface ParsedInbound {
  providerEmailId: string;
  fromEmail: string;
  fromName?: string;
  toEmail: string;
  subject?: string;
  bodyText?: string | null;
  bodyHtml?: string | null;
  headers?: Record<string, string | string[]>;
  attachmentsMeta?: AttachmentMeta[];
  messageId?: string;
  inReplyTo?: string;
  references?: string;
}

interface ThreadResolution {
  replyToOutboxId: string | null;
  replyToBlastId: string | null;
  relatedEventId: string | null;
  threadingSource: InboundThreadingSource;
}

function parseWebhookMetadata(payload: unknown): InboundMetadata | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const env = payload as { type?: unknown; data?: unknown };
  if (env.type !== 'email.received') return null;
  if (typeof env.data !== 'object' || env.data === null) return null;

  const d = env.data as Record<string, unknown>;
  const providerEmailId = str(d.email_id) ?? str(d.id);
  if (!providerEmailId) return null;

  const toRaw = toStringArray(d.to);
  if (toRaw.length === 0) return null;

  return {
    providerEmailId,
    fromRaw: str(d.from),
    toRaw,
    subject: str(d.subject),
    messageId: str(d.message_id),
    attachmentsMeta: extractAttachments(d.attachments),
  };
}

async function fetchReceivedEmail(emailId: string): Promise<FullReceivedEmail | null> {
  try {
    const { data, error } = await resend.emails.receiving.get(emailId);
    if (error) throw new Error(error.message);
    if (!data) return null;

    return {
      from: data.from,
      to: data.to,
      subject: data.subject,
      bodyText: data.text,
      bodyHtml: data.html,
      headers: data.headers ?? undefined,
      messageId: data.message_id,
      attachmentsMeta: extractAttachments(data.attachments),
    };
  } catch (error) {
    console.error('[webhook/inbound-email] failed to fetch full email:', error);
    return null;
  }
}

async function getRetryableInboundId(providerEmailId: string): Promise<string | null> {
  const [existing] = await db
    .select({
      id: inboundEmails.id,
      forwardStatus: inboundEmails.forwardStatus,
    })
    .from(inboundEmails)
    .where(eq(inboundEmails.providerEmailId, providerEmailId))
    .limit(1);

  if (!existing) return null;
  return existing.forwardStatus === 'not_attempted' || existing.forwardStatus === 'failed'
    ? existing.id
    : null;
}

function mergeInbound(metadata: InboundMetadata, fullEmail: FullReceivedEmail | null): ParsedInbound {
  const fromRaw = fullEmail?.from ?? metadata.fromRaw;
  if (!fromRaw) throw new Error('Inbound email missing sender');

  const fromEmail = extractEmailAddress(fromRaw);
  if (!fromEmail || !isPlausibleEmail(fromEmail)) {
    throw new Error('Inbound email has invalid sender');
  }

  const toCandidates = [
    ...(fullEmail?.to ?? []),
    ...metadata.toRaw,
  ].map((value) => extractEmailAddress(value)).filter((value): value is string => Boolean(value));
  const toEmail = toCandidates.find((value) => value.toLowerCase().startsWith('reply+'))
    ?? toCandidates[0];
  if (!toEmail || !isPlausibleEmail(toEmail)) {
    throw new Error('Inbound email missing recipient');
  }

  const headers = normalizeHeaders(fullEmail?.headers);
  const headerLookup = (name: string): string | undefined => {
    const v = headers?.[name.toLowerCase()];
    if (typeof v === 'string') return v;
    if (Array.isArray(v) && v.length > 0) return v[0];
    return undefined;
  };

  return {
    providerEmailId: metadata.providerEmailId,
    fromEmail: fromEmail.toLowerCase(),
    fromName: extractDisplayName(fromRaw),
    toEmail: toEmail.toLowerCase(),
    subject: fullEmail?.subject ?? metadata.subject,
    bodyText: fullEmail?.bodyText,
    bodyHtml: fullEmail?.bodyHtml,
    headers,
    attachmentsMeta: fullEmail?.attachmentsMeta ?? metadata.attachmentsMeta,
    messageId: fullEmail?.messageId ?? headerLookup('message-id') ?? metadata.messageId,
    inReplyTo: headerLookup('in-reply-to'),
    references: headerLookup('references'),
  };
}

async function resolveThread(parsed: ParsedInbound): Promise<ThreadResolution> {
  let replyToOutboxId: string | null = null;
  let replyToBlastId: string | null = null;
  let relatedEventId: string | null = null;
  let threadingSource: InboundThreadingSource = 'none';

  const tokenMatch = parsed.toEmail.match(/^reply\+([^@]+)@/);
  if (tokenMatch) {
    const token = tokenMatch[1];
    if (token.startsWith('blast-')) {
      const blastId = token.slice(6);
      if (UUID_RE.test(blastId)) {
        const [blast] = await db.select().from(emailBlasts).where(eq(emailBlasts.id, blastId)).limit(1);
        if (blast) {
          replyToBlastId = blast.id;
          threadingSource = 'reply_address';
        }
      }
    } else if (UUID_RE.test(token)) {
      const [row] = await db.select().from(emailOutbox).where(eq(emailOutbox.id, token)).limit(1);
      if (row) {
        replyToOutboxId = row.id;
        relatedEventId = row.relatedEventId;
        threadingSource = 'reply_address';
      }
    }
  }

  if (threadingSource === 'none') {
    const candidateMessageIds = [
      parsed.inReplyTo,
      ...(parsed.references?.split(/\s+/) ?? []),
    ].filter((v): v is string => Boolean(v));

    for (const mid of candidateMessageIds) {
      const [outboxHit] = await db
        .select()
        .from(emailOutbox)
        .where(eq(emailOutbox.messageId, mid))
        .limit(1);
      if (outboxHit) {
        replyToOutboxId = outboxHit.id;
        relatedEventId = outboxHit.relatedEventId;
        threadingSource = parsed.inReplyTo === mid ? 'in_reply_to' : 'references';
        break;
      }

      const [blastHit] = await db
        .select()
        .from(emailBlasts)
        .where(eq(emailBlasts.messageId, mid))
        .limit(1);
      if (blastHit) {
        replyToBlastId = blastHit.id;
        threadingSource = parsed.inReplyTo === mid ? 'in_reply_to' : 'references';
        break;
      }
    }
  }

  return { replyToOutboxId, replyToBlastId, relatedEventId, threadingSource };
}

async function resolveRelatedUserId(fromEmail: string): Promise<string | null> {
  const [u] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, fromEmail.toLowerCase()))
    .limit(1);
  return u?.id ?? null;
}

async function forwardToExec(
  emailId: string,
  parsed: ParsedInbound,
): Promise<{
  forwardedTo: string | null;
  forwardStatus: InboundForwardStatus;
  forwardedAt: Date | null;
  errorMessage?: string;
}> {
  const forwardedTo = process.env.INBOUND_FORWARD_TO || FORWARD_TO_DEFAULT;
  if (!forwardedTo) {
    return { forwardedTo: null, forwardStatus: 'not_attempted', forwardedAt: null };
  }
  if (parsed.fromEmail.toLowerCase() === forwardedTo.toLowerCase()) {
    return { forwardedTo, forwardStatus: 'not_attempted', forwardedAt: null };
  }

  try {
    const originalSubject = parsed.subject?.trim() || '(no subject)';
    const subject = /^fwd:/i.test(originalSubject) ? originalSubject : `Fwd: ${originalSubject}`;
    const { error } = await resend.emails.send(
      {
        from: process.env.EMAIL_FROM_AUTOMATED || FROM_AUTOMATED_DEFAULT,
        to: forwardedTo,
        replyTo: parsed.fromEmail,
        subject,
        text: buildForwardText(emailId, parsed),
        html: buildForwardHtml(emailId, parsed),
        headers: {
          'X-LatteLab-Inbound-Email-ID': emailId,
          'X-LatteLab-Original-From': parsed.fromEmail,
        },
      },
      { idempotencyKey: `inbound-forward/${emailId}` },
    );
    if (error) throw new Error(error.message);

    return { forwardedTo, forwardStatus: 'sent', forwardedAt: new Date() };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[webhook/inbound-email] exec forward failed:', message);
    return { forwardedTo, forwardStatus: 'failed', forwardedAt: null, errorMessage: message };
  }
}

function buildForwardText(emailId: string, parsed: ParsedInbound): string {
  const from = parsed.fromName ? `${parsed.fromName} <${parsed.fromEmail}>` : parsed.fromEmail;
  const attachmentNote = parsed.attachmentsMeta?.length
    ? `\nAttachments: ${parsed.attachmentsMeta.map((a) => a.filename).join(', ')}\n`
    : '';
  const body = parsed.bodyText
    ?? (parsed.bodyHtml ? htmlToText(parsed.bodyHtml) : '(empty message body)');

  return [
    'Forwarded inbound email for Latte Lab',
    `Resend email id: ${emailId}`,
    `From: ${from}`,
    `To: ${parsed.toEmail}`,
    `Subject: ${parsed.subject ?? '(no subject)'}`,
    attachmentNote.trim(),
    '--- Original message ---',
    body,
  ].filter(Boolean).join('\n');
}

function buildForwardHtml(emailId: string, parsed: ParsedInbound): string {
  const from = parsed.fromName ? `${parsed.fromName} <${parsed.fromEmail}>` : parsed.fromEmail;
  const attachmentNote = parsed.attachmentsMeta?.length
    ? `<p><strong>Attachments:</strong> ${escapeHtml(parsed.attachmentsMeta.map((a) => a.filename).join(', '))}</p>`
    : '';
  const body = parsed.bodyText
    ? `<pre style="white-space:pre-wrap;font-family:ui-monospace,SFMono-Regular,Consolas,monospace">${escapeHtml(parsed.bodyText)}</pre>`
    : parsed.bodyHtml
      ? `<pre style="white-space:pre-wrap;font-family:ui-monospace,SFMono-Regular,Consolas,monospace">${escapeHtml(htmlToText(parsed.bodyHtml))}</pre>`
      : '<p><em>(empty message body)</em></p>';

  return `
    <div style="font-family:Arial,sans-serif;color:#171717;line-height:1.5">
      <p><strong>Forwarded inbound email for Latte Lab</strong></p>
      <p>
        <strong>Resend email id:</strong> ${escapeHtml(emailId)}<br />
        <strong>From:</strong> ${escapeHtml(from)}<br />
        <strong>To:</strong> ${escapeHtml(parsed.toEmail)}<br />
        <strong>Subject:</strong> ${escapeHtml(parsed.subject ?? '(no subject)')}
      </p>
      ${attachmentNote}
      <hr />
      ${body}
    </div>
  `;
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string' && v.length > 0);
  return typeof value === 'string' && value.length > 0 ? [value] : [];
}

function normalizeHeaders(headers: Record<string, string> | undefined): Record<string, string | string[]> | undefined {
  if (!headers) return undefined;
  const normalized: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(headers)) {
    normalized[key.toLowerCase()] = value;
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function extractEmailAddress(addr: string): string | undefined {
  if (!addr) return undefined;
  const angle = addr.match(/<([^>]+)>/);
  if (angle) return angle[1].trim();
  return addr.trim();
}

function isPlausibleEmail(addr: string): boolean {
  const at = addr.indexOf('@');
  return at > 0 && at < addr.length - 1 && !addr.includes(' ');
}

function extractDisplayName(addr: string): string | undefined {
  const m = addr.match(/^\s*"?([^<"]+?)"?\s*</);
  return m ? m[1].trim() : undefined;
}

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function extractAttachments(value: unknown): AttachmentMeta[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items: AttachmentMeta[] = [];
  for (const a of value) {
    if (typeof a !== 'object' || a === null) continue;
    const ax = a as Record<string, unknown>;
    const filename = str(ax.filename) ?? str(ax.name);
    if (!filename) continue;
    items.push({
      id: str(ax.id),
      filename,
      contentType: str(ax.content_type) ?? str(ax.contentType) ?? 'application/octet-stream',
      size: typeof ax.size === 'number' ? ax.size : 0,
      contentId: str(ax.content_id) ?? str(ax.contentId) ?? null,
      contentDisposition: str(ax.content_disposition) ?? str(ax.contentDisposition) ?? null,
    });
  }
  return items.length > 0 ? items : undefined;
}
