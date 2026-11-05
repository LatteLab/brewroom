import { requirePosActor } from '@/lib/pos-access';
import { getPosEvent, getPosReport } from '@/lib/db/pos-queries';
import { logsCsv } from '@/lib/pos';
import { z } from 'zod';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  let actor; try { actor = await requirePosActor(); } catch { return new Response('Administrator access is required.', { status: 403 }); }
  const { eventId } = await params; if (!z.uuid().safeParse(eventId).success) return new Response('Not found.', { status: 404 });
  const event = await getPosEvent(actor, eventId); if (!event) return new Response('Not found.', { status: 404 });
  const logs = await getPosReport(actor, eventId);
  return new Response(logsCsv(logs), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="drink-logs-${eventId}.csv"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
}
