import Link from 'next/link';
import { requirePosActor } from '@/lib/pos-access';
import { getPosOverview } from '@/lib/db/pos-queries';
import { formatPosDate } from '@/lib/pos';
import { PosBreakdowns } from '@/components/pos/breakdowns';
import { DeletePosEvent } from '@/components/pos/delete-event';
import styles from '@/components/pos/pos.module.css';
export const dynamic = 'force-dynamic';
export default async function PosOverviewPage() {
  const report = await getPosOverview(await requirePosActor(true));
  return <div className={styles.adminPage}>
    <header className={styles.adminHeader}>
      <div><h1>POS</h1><p>A view across all events, with individual menus and order history below.</p></div>
      <div className={styles.actions}><Link href="/kiosk" className={styles.secondary}>Open kiosk</Link><Link href="/admin/pos/new" className={styles.primary}>Create event</Link></div>
    </header>
    <section aria-labelledby="overview-heading" className={styles.section}>
      <h2 id="overview-heading">All events at a glance</h2>
      <p className={styles.muted}>All recorded orders, including those outside event windows. Voided entries are excluded; corrections replace the original entry.</p>
      <div className={styles.stats}>
        <div><span>Drinks ordered</span><strong>{report.totalDrinks.toLocaleString()}</strong></div>
        <div><span>Orders recorded</span><strong>{report.totalOrders.toLocaleString()}</strong></div>
        <div><span>Events</span><strong>{report.events.length}</strong></div>
        <div><span>Drinks per order</span><strong>{report.drinksPerOrder?.toFixed(1) ?? '—'}</strong></div>
      </div>
      <h3>Drink and option breakdowns</h3>
      <p className={styles.muted}>Matching recorded drink names are combined across events. Percentages are based on drink quantities.</p>
      <PosBreakdowns report={report} />
    </section>
    <section className={styles.section} aria-labelledby="events-heading">
      <div className={styles.sectionTop}><div><h2 id="events-heading">Events</h2><p className={styles.muted}>Newest service dates first. All times Eastern.</p></div></div>
      <div className={styles.eventList}>{report.events.length ? report.events.map(event =>
        <article className={styles.eventCard} key={event.id}>
          <div className={styles.eventInfo}>
            <h3><Link href={`/admin/pos/${event.id}`}>{event.name}</Link></h3>
            <p>{formatPosDate(event.startsAt)} – {formatPosDate(event.endsAt)}</p>
            <p className={styles.eventCounts}><strong>{event.totalDrinks.toLocaleString()}</strong> drinks · <strong>{event.totalOrders.toLocaleString()}</strong> orders</p>
          </div>
          <div className={styles.actions}>
            <Link href={`/admin/pos/${event.id}`} className={styles.secondary}>Manage and analyze</Link>
            <Link href={`/kiosk/${event.id}`} className={styles.primary}>Log orders</Link>
            <DeletePosEvent event={event} />
          </div>
        </article>
      ) : <p className={styles.empty}>Create your first event, add its drinks, and start recording orders.</p>}</div>
    </section>
  </div>;
}
