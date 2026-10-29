import Link from 'next/link';
import { requirePosActor } from '@/lib/pos-access';
import { PosEventForm } from '@/components/pos/event-form';
import { easternInput } from '@/lib/pos';
import styles from '@/components/pos/pos.module.css';
export default async function NewPosEventPage() {
  await requirePosActor(true);
  const start = new Date(); const end = new Date(start.getTime() + 7200000);
  return <div className={styles.adminPage}><header className={styles.adminHeader}><div><Link href="/admin/pos" className={styles.textLink}>← POS overview</Link><h1>Create an event</h1><p>Set the name and service window, then add this event’s drinks. New menus start empty.</p></div></header><PosEventForm initialStart={easternInput(start)} initialEnd={easternInput(end)} /></div>;
}
