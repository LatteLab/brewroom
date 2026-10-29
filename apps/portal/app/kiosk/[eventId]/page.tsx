import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requirePosActor } from '@/lib/pos-access';
import { getPosEvent, getPosLogs, getPosMenu } from '@/lib/db/pos-queries';
import { Kiosk } from '@/components/pos/kiosk';
import { PosAccessDenied } from '@/components/pos/access-denied';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Order logger · Latte Lab', robots: { index: false, follow: false } };
export default async function KioskPage({ params }: { params: Promise<{ eventId: string }> }) {
  let actor; try { actor = await requirePosActor(); } catch { return <PosAccessDenied />; }
  const { eventId } = await params; if (!z.uuid().safeParse(eventId).success) notFound();
  const event = await getPosEvent(actor, eventId); if (!event) notFound();
  const [menu, logs] = await Promise.all([getPosMenu(actor, eventId), getPosLogs(actor, eventId, true)]);
  return <Kiosk initialSubmissionId={crypto.randomUUID()} event={event} menu={menu} logs={logs} actorId={actor.id} isAdmin={actor.isAdmin} />;
}
