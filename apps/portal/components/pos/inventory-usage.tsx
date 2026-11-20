import Link from 'next/link';
import { estimateUsage, formatAmount, stockStatus } from '@/lib/inventory';
import type { InventoryItem, PosDrinkLog, PosMenuIngredient } from '@/lib/db/schema';
import styles from './pos.module.css';

export function InventoryUsage({ logs, ingredients, stock }: { logs: PosDrinkLog[]; ingredients: PosMenuIngredient[]; stock: InventoryItem[] }) {
  const { used, drinksWithoutIngredients } = estimateUsage(logs, ingredients);
  const rows = stock.filter(item => used.has(item.id)).map(item => ({ item, used: used.get(item.id)! })).sort((a, b) => b.used - a.used);
  return <section className={styles.section} aria-labelledby="usage-heading">
    <h2 id="usage-heading">Estimated usage</h2>
    <p className={styles.muted}>Worked out from this event’s logged drinks and each drink’s ingredients. Stock only changes when you update it on the <Link href="/admin/inventory" className={styles.textLink}>Inventory</Link> page.</p>
    {rows.length ? <div className={styles.tableScroll}><table className={styles.stockTable}>
      <thead><tr><th scope="col">Item</th><th scope="col">Used (est.)</th><th scope="col">On hand now</th><th scope="col">Status</th></tr></thead>
      <tbody>{rows.map(({ item, used }) => { const status = stockStatus(item); return <tr key={item.id}><th scope="row">{item.name}</th><td>{formatAmount(used, item.unit)}</td><td>{formatAmount(item.onHand, item.unit)}</td><td><span className={styles[`status${status}`]}>{status}</span></td></tr>; })}</tbody>
    </table></div> : <p className={styles.empty}>{logs.length ? 'None of the logged drinks have ingredients yet. Add them in the menu below.' : 'No drinks logged yet.'}</p>}
    {drinksWithoutIngredients.length > 0 && <p className={styles.muted}>Not counted, no ingredients listed: {drinksWithoutIngredients.map(drink => `${drink.name} (${drink.drinks})`).join(', ')}.</p>}
  </section>;
}
