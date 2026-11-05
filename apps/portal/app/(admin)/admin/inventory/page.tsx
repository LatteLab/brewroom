import { requireInventoryAdmin } from '@/lib/inventory-access';
import { getInventoryStock } from '@/lib/db/inventory-queries';
import { fmtMoney, stockStatus, unitCost } from '@/lib/inventory';
import { StockTable } from '@/components/inventory/stock-table';
import { DrinkWarnings } from '@/components/inventory/drink-warnings';
import posStyles from '@/components/pos/pos.module.css';
export const dynamic = 'force-dynamic';

export default async function InventoryStockPage() {
  const { items, warnings } = await getInventoryStock(await requireInventoryAdmin());
  const low = items.filter(item => stockStatus(item.onHand, item.par) !== 'ok').length;
  const value = items.reduce((sum, item) => sum + Math.max(0, item.onHand) * unitCost(item.packages), 0);
  return <section className={posStyles.section} aria-labelledby="stock-heading">
    <h2 id="stock-heading">Stock</h2>
    <DrinkWarnings warnings={warnings} />
    <p className={posStyles.muted}>Every drink logged in POS deducts its recipe from <strong>On hand now</strong> immediately, using that order’s milk, syrup, ice and temperature. Removing or correcting an entry in POS updates it too. Count each item’s sealed bags per purchase option plus the open amount, then select <strong>Save count</strong> to replace the estimate with what is really there.</p>
    <div className={posStyles.stats}>
      <div><span>Items</span><strong>{items.length}</strong></div>
      <div><span>At or below par</span><strong>{low}</strong></div>
      <div><span>Value on hand</span><strong>{fmtMoney(value)}</strong></div>
      <div><span>Drinks running low</span><strong>{warnings.length}</strong></div>
    </div>
    <StockTable items={items} />
  </section>;
}
