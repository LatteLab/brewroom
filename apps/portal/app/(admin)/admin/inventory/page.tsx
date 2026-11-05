import { requireInventoryAdmin } from '@/lib/inventory-access';
import { getInventoryStock } from '@/lib/db/inventory-queries';
import { fmtMoney, stockStatus } from '@/lib/inventory';
import { StockTable } from '@/components/inventory/stock-table';
import posStyles from '@/components/pos/pos.module.css';
export const dynamic = 'force-dynamic';

export default async function InventoryStockPage() {
  const items = await getInventoryStock(await requireInventoryAdmin());
  const low = items.filter(item => stockStatus(item.onHand, item.par) !== 'ok').length;
  const value = items.reduce((sum, item) => sum + Math.max(0, item.onHand) * item.costPerUnit, 0);
  return <section className={posStyles.section} aria-labelledby="stock-heading">
    <h2 id="stock-heading">Stock</h2>
    <p className={posStyles.muted}>Count each item as sealed bags plus whatever is left in the open bag, then select <strong>Save count</strong>. Drinks logged in POS after that count are deducted using each drink’s linked recipe, so the estimate keeps moving during an event without anyone retyping it. Voided and corrected entries update the estimate automatically. Recount after an event to reset the baseline.</p>
    <div className={posStyles.stats}>
      <div><span>Items</span><strong>{items.length}</strong></div>
      <div><span>At or below par</span><strong>{low}</strong></div>
      <div><span>Estimated value on hand</span><strong>{fmtMoney(value)}</strong></div>
    </div>
    <StockTable items={items} />
  </section>;
}
