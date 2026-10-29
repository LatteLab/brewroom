import Link from 'next/link';
import { requirePosActor } from '@/lib/pos-access';
import { PosEventForm } from '@/components/pos/event-form';
import { easternInput } from '@/lib/pos';
import styles from '@/components/pos/pos.module.css';
export default async function NewPosEventPage() {
  await requirePosActor(true);
  const start = new Date(); const end = new Date(start.getTime() + 7200000);
  return <div className={styles.adminPage}><header className={styles.adminHeader}><div><Link href="/admin/pos" className={styles.textLink}>← POS events</Link><h1>Create an event</h1><p>Start with a name, service window, and an editable fall menu.</p></div></header><PosEventForm initialStart={easternInput(start)} initialEnd={easternInput(end)} /></div>;
}
