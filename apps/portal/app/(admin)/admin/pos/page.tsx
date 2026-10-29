import Link from 'next/link';
import { requirePosActor } from '@/lib/pos-access';
import { listPosEvents } from '@/lib/db/pos-queries';
import { formatPosDate } from '@/lib/pos';
import styles from '@/components/pos/pos.module.css';
export const dynamic = 'force-dynamic';
export default async function PosEventsPage() {
  const actor = await requirePosActor(true); const events = await listPosEvents(actor);
  return <div className={styles.adminPage}><header className={styles.adminHeader}><div><h1>POS events</h1><p>Menus, recorded orders, and drink analytics. All times Eastern.</p></div><div className={styles.actions}><Link href="/kiosk" className={styles.secondary}>Open kiosk</Link><Link href="/admin/pos/new" className={styles.primary}>Create event</Link></div></header><div className={styles.eventList}>{events.length ? events.map(event => <article className={styles.eventCard} key={event.id}><div><h2>{event.name}</h2><p>{formatPosDate(event.startsAt)} – {formatPosDate(event.endsAt)}</p></div><div className={styles.actions}><Link href={`/admin/pos/${event.id}`} className={styles.secondary}>Manage and analyze</Link><Link href={`/kiosk/${event.id}`} className={styles.primary}>Log orders</Link></div></article>) : <p className={styles.empty}>Create your first event to set its menu and start recording orders.</p>}</div></div>;
}
