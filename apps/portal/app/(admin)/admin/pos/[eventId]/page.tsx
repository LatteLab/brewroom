import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requirePosActor } from '@/lib/pos-access';
import { getPosEvent, getPosLogs, getPosMenu } from '@/lib/db/pos-queries';
import { PosEventForm } from '@/components/pos/event-form';
import { MenuEditor } from '@/components/pos/menu-editor';
import { RecentLogs } from '@/components/pos/recent-logs';
import { PosAnalytics } from '@/components/pos/analytics';
import styles from '@/components/pos/pos.module.css';
export const dynamic = 'force-dynamic';
export default async function PosEventPage({ params, searchParams }: { params: Promise<{ eventId: string }>; searchParams: Promise<{ interval?: string }> }) {
  const actor = await requirePosActor(true); const { eventId } = await params; if (!z.uuid().safeParse(eventId).success) notFound();
  const event = await getPosEvent(actor, eventId); if (!event) notFound();
  const [menu, history] = await Promise.all([getPosMenu(actor, eventId), getPosLogs(actor, eventId, true)]);
  const query = await searchParams; const interval = query.interval === '5' ? 5 : 15;
  return <div className={styles.adminPage}><header className={styles.adminHeader}><div><Link href="/admin/pos" className={styles.textLink}>← POS events</Link><h1>{event.name}</h1><p>Manage this event’s menu and understand recorded order activity.</p></div><Link href={`/kiosk/${event.id}`} className={styles.primary}>Open order logger</Link></header><nav className={styles.actions} aria-label="Event sections"><a href="#analytics" className={styles.secondary}>Analytics</a><a href="#setup" className={styles.secondary}>Event setup</a><a href="#menu" className={styles.secondary}>Menu</a><a href="#logs" className={styles.secondary}>Order history</a></nav><div id="analytics"><PosAnalytics event={event} logs={history.filter(log => !log.voidedAt)} interval={interval} /></div><section id="setup" className={styles.section}><h2>Event setup</h2><PosEventForm event={event} /></section><div id="menu"><MenuEditor eventId={event.id} menu={menu} /></div><div id="logs"><RecentLogs logs={history} isAdmin actorId={actor.id} /></div></div>;
}
