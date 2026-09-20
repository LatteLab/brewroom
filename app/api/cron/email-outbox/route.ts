import { NextRequest, NextResponse } from 'next/server';
import { drainOutbox } from '@/lib/emails/send';

// Force Node runtime - postgres-js uses Node net APIs, won't work on edge.
export const runtime = 'nodejs';
// Drain processes up to 100 rows x ~500ms each. Vercel Pro caps at 60s for crons.
export const maxDuration = 60;

/**
 * Cron-driven outbox drain. Processes scheduled and failed-with-retry rows.
 * Runs every 10 min on Vercel Pro; daily on Hobby (less reliable for reminders).
 *
 * Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`. External schedulers
 * (QStash, GitHub Actions) should send the same header.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const expected = process.env.CRON_SECRET;
  if (!expected || authHeader !== `Bearer ${expected}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const result = await drainOutbox(100);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error('[cron/email-outbox] failed:', error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'unknown' },
      { status: 500 },
    );
  }
}
