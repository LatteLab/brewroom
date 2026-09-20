import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';

export const runtime = 'nodejs';
export const maxDuration = 30;

import { updateRecipientStatus } from '@/lib/db/email-queries';
import { db } from '@/lib/db';
import { emailOutbox } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { EmailRecipientStatus, EmailOutboxStatus } from '@/lib/db/schema';

export async function POST(req: NextRequest) {
  try {
    const svixId = req.headers.get('svix-id');
    const svixTimestamp = req.headers.get('svix-timestamp');
    const svixSignature = req.headers.get('svix-signature');

    if (!svixId || !svixTimestamp || !svixSignature) {
      return NextResponse.json({ error: 'Missing signature headers' }, { status: 401 });
    }

    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (!secret) {
      console.error('[webhook/resend] Missing required environment configuration');
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    // Verify Svix signature - must use raw body text
    const rawBody = await req.text();
    const wh = new Webhook(secret);
    let payload: { type: string; data: { email_id?: string } };
    try {
      payload = wh.verify(rawBody, {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      }) as typeof payload;
    } catch {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const { type, data } = payload;

    // Map Resend event types to our status. Email recipients (blasts) and outbox (transactional)
    // share the same shape so we can use a unified mapping for both.
    const recipientStatusMap: Record<string, EmailRecipientStatus> = {
      'email.sent': 'sent',
      'email.delivered': 'delivered',
      'email.delivery_delayed': 'sent',
      'email.bounced': 'bounced',
      'email.complained': 'bounced',
      'email.failed': 'failed',
      'email.suppressed': 'failed',
    };
    const outboxStatusMap: Record<string, EmailOutboxStatus> = {
      'email.sent': 'sent',
      'email.delivered': 'delivered',
      'email.delivery_delayed': 'sent',
      'email.bounced': 'bounced',
      'email.complained': 'bounced',
      'email.failed': 'failed',
      'email.suppressed': 'failed',
    };

    const recipientStatus = recipientStatusMap[type];
    const outboxStatus = outboxStatusMap[type];

    if (!data?.email_id || (!recipientStatus && !outboxStatus)) {
      return NextResponse.json({ ok: true }); // Ignore unhandled events
    }

    // Update both surfaces by Resend email_id. Each lookup is independent - a single Resend ID
    // belongs to exactly one record across the two tables in practice, but updating both is harmless.
    if (recipientStatus) {
      await updateRecipientStatus(data.email_id, recipientStatus);
    }
    if (outboxStatus) {
      await db
        .update(emailOutbox)
        .set({ status: outboxStatus, updatedAt: new Date() })
        .where(eq(emailOutbox.providerMessageId, data.email_id));
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Resend webhook error:', error);
    return NextResponse.json({ error: 'Processing error' }, { status: 500 });
  }
}
