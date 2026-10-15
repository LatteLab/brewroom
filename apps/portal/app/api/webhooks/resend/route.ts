import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { updateRecipientStatus } from '@/lib/db/email-queries';
import type { EmailRecipientStatus } from '@/lib/db/schema';

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

    // Verify Svix signature — must use raw body text
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

    // Map Resend event types to our status
    const statusMap: Record<string, EmailRecipientStatus> = {
      'email.sent': 'sent',
      'email.delivered': 'delivered',
      'email.delivery_delayed': 'sent',
      'email.bounced': 'bounced',
      'email.complained': 'bounced',
    };

    const newStatus = statusMap[type];
    if (!newStatus || !data?.email_id) {
      return NextResponse.json({ ok: true }); // Ignore unhandled events
    }

    await updateRecipientStatus(data.email_id, newStatus);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Resend webhook error:', error);
    return NextResponse.json({ error: 'Processing error' }, { status: 500 });
  }
}
