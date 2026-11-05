import Link from 'next/link';
import { requireInventoryAdmin } from '@/lib/inventory-access';
import { getInventoryStock } from '@/lib/db/inventory-queries';
import { fmtMoney, stockStatus, unitCost } from '@/lib/inventory';
import { formatPosDate } from '@/lib/pos';
import { StockTable } from '@/components/inventory/stock-table';
import { DrinkWarnings } from '@/components/inventory/drink-warnings';
import { CapacitySummary } from '@/components/inventory/capacity';
import posStyles from '@/components/pos/pos.module.css';
import styles from '@/components/inventory/inventory.module.css';
export const dynamic = 'force-dynamic';

export default async function InventoryStockPage() {
  const { items, warnings, nextEvent } = await getInventoryStock(await requireInventoryAdmin());
  const low = items.filter(item => stockStatus(item.onHand, item.par) !== 'ok').length;
  const value = items.reduce((sum, item) => sum + Math.max(0, item.onHand) * unitCost(item.packages), 0);
  return <section className={posStyles.section} aria-labelledby="stock-heading">
    <h2 id="stock-heading">Stock</h2>
    <p className={posStyles.muted}>Drinks logged in POS come off <strong>On hand</strong> as soon as they are recorded. Use <strong>Save count</strong> after a physical count.</p>
    <DrinkWarnings warnings={warnings} />
    {items.length > 0 && <p className={styles.summary}>
      <span><strong>{items.length}</strong> items</span>
      <span><strong>{low}</strong> at or below par</span>
      <span><strong>{fmtMoney(value)}</strong> on hand</span>
    </p>}
    {nextEvent && <div className={styles.panel} style={{ maxWidth: 'none' }}>
      <div className={posStyles.sectionTop} style={{ marginBottom: 4 }}>
        <div><h2>What stock can make</h2><p className={posStyles.muted}>{nextEvent.name} · {formatPosDate(nextEvent.startsAt)}</p></div>
        <Link className={posStyles.textLink} href={`/admin/inventory/events/${nextEvent.id}`}>Plan this event</Link>
      </div>
      <div className={styles.makeList}>{nextEvent.drinks.map(drink => <div className={styles.makeRow} key={drink.id}><span>{drink.name}</span><CapacitySummary capacity={drink.capacity} /></div>)}</div>
    </div>}
    <StockTable items={items} />
  </section>;
}
