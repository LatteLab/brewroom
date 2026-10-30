import Link from 'next/link';
import { requirePosActor } from '@/lib/pos-access';
import { listPosEvents } from '@/lib/db/pos-queries';
import { formatPosDate } from '@/lib/pos';
import { PosAccessDenied } from '@/components/pos/access-denied';
import styles from '@/components/pos/pos.module.css';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Order station · Latte Lab', robots: { index: false, follow: false } };
export default async function KioskChooser() {
  let actor; try { actor = await requirePosActor(); } catch { return <PosAccessDenied />; }
  const events = await listPosEvents(actor);
  return <main className={styles.kiosk}><div className={styles.adminPage}><header className={styles.adminHeader}><div><h1>Latte Lab order station</h1><p>Choose the event you’re recording orders for. All times Eastern.</p></div><Link className={styles.secondary} href="/admin/pos">Manage events</Link></header><div className={styles.eventList}>{events.length ? events.map(event => <article className={styles.eventCard} key={event.id}><div><h2>{event.name}</h2><p>{formatPosDate(event.startsAt)} – {formatPosDate(event.endsAt)}</p></div><Link href={`/kiosk/${event.id}`} className={styles.primary}>Log orders</Link></article>) : <p className={styles.empty}>No events yet. Ask the team lead to create one.</p>}</div></div></main>;
}
