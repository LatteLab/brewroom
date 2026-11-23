import { requirePosActor } from '@/lib/pos-access';
import { listInventoryItems } from '@/lib/db/inventory-queries';
import { InventoryStock } from '@/components/pos/inventory-stock';
import styles from '@/components/pos/pos.module.css';
export const dynamic = 'force-dynamic';
export default async function InventoryPage() {
  const items = await listInventoryItems(await requirePosActor());
  return <div className={styles.adminPage}>
    <header className={styles.adminHeader}><div><h1>Inventory</h1><p>What we have on hand. Edit a number and click away to save. Logging drinks never changes these amounts.</p></div></header>
    <section className={styles.section}><InventoryStock items={items} /></section>
  </div>;
}
