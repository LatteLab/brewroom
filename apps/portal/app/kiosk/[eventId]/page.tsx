import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requirePosActor } from '@/lib/pos-access';
import { getPosEvent, getPosLogs, getPosMenu } from '@/lib/db/pos-queries';
import { Kiosk } from '@/components/pos/kiosk';
import { PosAccessDenied } from '@/components/pos/access-denied';
import { DrinkWarnings } from '@/components/inventory/drink-warnings';
import { getDrinkWarnings } from '@/lib/db/inventory-queries';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Order logger · Latte Lab', robots: { index: false, follow: false } };
// Inventory must never stop drinks being logged: if it cannot be read, the kiosk simply shows no warning.
async function runningLow(actor: Awaited<ReturnType<typeof requirePosActor>>, eventId: string) {
  try { return await getDrinkWarnings(actor, eventId); } catch (error) { console.error('Inventory warnings unavailable', error); return []; }
}
export default async function KioskPage({ params }: { params: Promise<{ eventId: string }> }) {
  let actor; try { actor = await requirePosActor(); } catch { return <PosAccessDenied />; }
  const { eventId } = await params; if (!z.uuid().safeParse(eventId).success) notFound();
  const event = await getPosEvent(actor, eventId); if (!event) notFound();
  const [menu, logs, warnings] = await Promise.all([getPosMenu(actor, eventId), getPosLogs(actor, eventId, true), runningLow(actor, eventId)]);
  return <Kiosk initialSubmissionId={crypto.randomUUID()} event={event} menu={menu} logs={logs} notice={<DrinkWarnings warnings={warnings} compact />} />;
}
