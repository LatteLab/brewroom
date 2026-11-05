import { requireInventoryAdmin } from '@/lib/inventory-access';
import { ImportForm } from '@/components/inventory/import-form';
import posStyles from '@/components/pos/pos.module.css';
import styles from '@/components/inventory/inventory.module.css';

export default async function InventoryDataPage() {
  await requireInventoryAdmin();
  return <section className={posStyles.section} aria-labelledby="data-heading">
    <h2 id="data-heading">Import / export</h2>
    <p className={posStyles.muted}>Uses the prototype’s exchange format, so data exported from the old recipe-book app (or built with its <code>tools/build_bundle.py</code>) loads here unchanged. Import matches inventory and equipment by name and recipes by slug: a match updates that record, anything new is added, and nothing is ever deleted, so a partial file is safe.</p>
    <div className={styles.panel}>
      <h2>Everything</h2>
      <p className={posStyles.muted}>One JSON file with inventory, equipment and recipes. Published recipes land in the book and draft recipes stay drafts. Recipe lines keep their POS rules (<code>when</code> and <code>scale</code>); files from the prototype default every line to “every drink, fixed amount”, so review milk, cup, syrup and ice lines after importing.</p>
      <div className={posStyles.actions} style={{ margin: '12px 0' }}><a className={posStyles.secondary} href="/admin/inventory/export">Export data file</a></div>
      <ImportForm kind="bundle" />
    </div>
    <div className={styles.panel}>
      <h2>Inventory only</h2>
      <p className={posStyles.muted}>The same columns as the counting spreadsheet. “Qty on hand” is written for reading and ignored on import. Changing an item’s bag counts records a new count.</p>
      <div className={posStyles.actions} style={{ margin: '12px 0' }}><a className={posStyles.secondary} href="/admin/inventory/export?format=csv">Export CSV</a></div>
      <ImportForm kind="csv" />
    </div>
  </section>;
}
