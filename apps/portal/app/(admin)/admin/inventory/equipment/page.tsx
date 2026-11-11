import { requireInventoryAdmin } from '@/lib/inventory-access';
import { listEquipment } from '@/lib/db/inventory-queries';
import { equipmentStatusMeta } from '@/lib/inventory';
import { EquipmentDialog } from '@/components/inventory/equipment-dialog';
import { EquipmentPill } from '@/components/inventory/pills';
import posStyles from '@/components/pos/pos.module.css';
import styles from '@/components/inventory/inventory.module.css';
export const dynamic = 'force-dynamic';

export default async function EquipmentPage() {
  const items = await listEquipment(await requireInventoryAdmin());
  const ready = items.reduce((sum, item) => sum + (equipmentStatusMeta[item.status].usable ? item.quantity : 0), 0);
  const attention = items.filter(item => !equipmentStatusMeta[item.status].usable).length;
  return <section className={posStyles.section} aria-labelledby="equipment-heading">
    <div className={posStyles.sectionTop}><div><h2 id="equipment-heading">Equipment</h2>
      <p className={posStyles.muted}>The machines, tools and furniture we own. None of it is used up, so what matters is how many we have, whether they work, and where to fetch them.</p></div>
      <EquipmentDialog /></div>
    <div className={posStyles.stats}><div><span>Lines</span><strong>{items.length}</strong></div><div><span>Units ready</span><strong>{ready}</strong></div><div><span>Need attention</span><strong>{attention}</strong></div></div>
    {items.length ? <div className={styles.tableWrap}><table className={`${styles.table} ${styles.stack}`}>
      <thead><tr><th>Item</th><th className={styles.r}>Qty</th><th>Condition</th><th>Where it lives</th><th>Looked after by</th><th>Last checked</th><th></th></tr></thead>
      <tbody>{items.map(item => <tr key={`${item.id}-${item.version}`} className={equipmentStatusMeta[item.status].usable ? undefined : styles.short}>
        <td>{item.name}<span className={styles.sub}>{[item.category, item.serial, item.notes].filter(Boolean).join(' · ')}</span></td>
        <td data-label="Qty" className={styles.r}>{item.quantity}</td>
        <td data-label="Condition"><EquipmentPill status={item.status} /></td>
        <td data-label="Where it lives">{item.location || '—'}</td>
        <td data-label="Looked after by">{item.custodian || '—'}</td>
        <td data-label="Last checked">{item.lastCheckedAt || '—'}</td>
        <td data-label=""><EquipmentDialog item={item} /></td>
      </tr>)}</tbody>
    </table></div> : <p className={posStyles.empty}>No equipment yet. Add it here, or import the prototype’s data file.</p>}
  </section>;
}
