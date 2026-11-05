import Link from 'next/link';
import { requireInventoryAdmin } from '@/lib/inventory-access';
import { listInventoryEvents } from '@/lib/db/inventory-queries';
import { formatPosDate } from '@/lib/pos';
import posStyles from '@/components/pos/pos.module.css';
export const dynamic = 'force-dynamic';

export default async function InventoryEventsPage() {
  const events = await listInventoryEvents(await requireInventoryAdmin());
  return <section className={posStyles.section} aria-labelledby="events-heading">
    <h2 id="events-heading">Event planning</h2>
    <p className={posStyles.muted}>These are the POS events from the POS tab; inventory does not keep a separate event list. Open one to link each drink to a recipe, plan servings, see what to buy, and compare against what was actually logged.</p>
    <div className={posStyles.eventList}>{events.length ? events.map(event => <article className={posStyles.eventCard} key={event.id}>
      <div className={posStyles.eventInfo}>
        <h3><Link href={`/admin/inventory/events/${event.id}`}>{event.name}</Link></h3>
        <p>{formatPosDate(event.startsAt)} – {formatPosDate(event.endsAt)}</p>
        <p className={posStyles.eventCounts}><strong>{event.linked}</strong> of <strong>{event.drinks}</strong> drinks linked to a recipe · <strong>{event.planned.toLocaleString()}</strong> servings planned</p>
      </div>
      <div className={posStyles.actions}><Link href={`/admin/inventory/events/${event.id}`} className={posStyles.primary}>Plan inventory</Link><Link href={`/admin/pos/${event.id}`} className={posStyles.secondary}>POS event</Link></div>
    </article>) : <p className={posStyles.empty}>No POS events yet. Create one in the POS tab and add its drinks; it appears here automatically.</p>}</div>
  </section>;
}
