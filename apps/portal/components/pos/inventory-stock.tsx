'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createInventoryItemAction, deleteInventoryItemAction, updateInventoryCountAction } from '@/app/actions/inventory';
import { stockStatus } from '@/lib/inventory';
import { inventoryUnits, type InventoryUnit } from '@/lib/validations/inventory';
import type { InventoryItem } from '@/lib/db/schema';
import styles from './pos.module.css';

function StockRow({ item }: { item: InventoryItem }) {
  const router = useRouter();
  const [onHand, setOnHand] = useState(String(item.onHand)); const [lowAt, setLowAt] = useState(String(item.lowAt));
  const [pending, startTransition] = useTransition(); const [error, setError] = useState('');
  const status = stockStatus(item);
  function save() {
    const next = { onHand: Number(onHand), lowAt: Number(lowAt) };
    if (next.onHand === item.onHand && next.lowAt === item.lowAt) return;
    if (!Number.isFinite(next.onHand) || !Number.isFinite(next.lowAt) || onHand.trim() === '' || lowAt.trim() === '') { setError('Enter numbers.'); return; }
    setError('');
    startTransition(async () => {
      const result = await updateInventoryCountAction({ id: item.id, expectedVersion: item.version, ...next });
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }
  return <tr>
    <th scope="row">{item.name}{error && <span role="alert" className={styles.rowError}>{error}</span>}</th>
    <td><label className={styles.cellInput}><span className={styles.srOnly}>On hand for {item.name}</span><input inputMode="decimal" value={onHand} disabled={pending} onChange={e => setOnHand(e.target.value)} onBlur={save} /><small>{item.unit}</small></label></td>
    <td><label className={styles.cellInput}><span className={styles.srOnly}>Low level for {item.name}</span><input inputMode="decimal" value={lowAt} disabled={pending} onChange={e => setLowAt(e.target.value)} onBlur={save} /><small>{item.unit}</small></label></td>
    <td><span className={styles[`status${status}`]}>{status}</span></td>
    <td><button type="button" className={styles.danger} disabled={pending} aria-label={`Delete ${item.name}`} onClick={() => {
      if (!window.confirm(`Delete “${item.name}” from inventory?`)) return;
      startTransition(async () => { const result = await deleteInventoryItemAction({ id: item.id }); if (!result.ok) setError(result.error); router.refresh(); });
    }}>Delete</button></td>
  </tr>;
}

function AddItem() {
  const router = useRouter();
  const [name, setName] = useState(''); const [unit, setUnit] = useState<InventoryUnit>('ml');
  const [onHand, setOnHand] = useState(''); const [lowAt, setLowAt] = useState('');
  const [pending, startTransition] = useTransition(); const [error, setError] = useState('');
  return <form className={`${styles.form} ${styles.addStock}`} onSubmit={e => {
    e.preventDefault(); setError('');
    startTransition(async () => {
      const result = await createInventoryItemAction({ name, unit, onHand: Number(onHand || 0), lowAt: Number(lowAt || 0) });
      if (!result.ok) { setError(result.error); return; }
      setName(''); setOnHand(''); setLowAt(''); router.refresh();
    });
  }}>
    <h3>Add an item</h3>
    <label>Name<input required maxLength={120} value={name} onChange={e => setName(e.target.value)} placeholder="Oat milk" /></label>
    <label>Unit<select value={unit} onChange={e => setUnit(e.target.value as InventoryUnit)}>{inventoryUnits.map(value => <option key={value}>{value}</option>)}</select></label>
    <label>On hand<input inputMode="decimal" value={onHand} onChange={e => setOnHand(e.target.value)} placeholder="0" /></label>
    <label>Low when below<input inputMode="decimal" value={lowAt} onChange={e => setLowAt(e.target.value)} placeholder="0" /></label>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <div><button type="submit" className={styles.primary} disabled={pending}>{pending ? 'Adding…' : 'Add item'}</button></div>
  </form>;
}

export function InventoryStock({ items }: { items: InventoryItem[] }) {
  const order = { Out: 0, Low: 1, OK: 2 };
  const sorted = [...items].sort((a, b) => order[stockStatus(a)] - order[stockStatus(b)] || a.name.localeCompare(b.name));
  return <>
    {sorted.length ? <div className={styles.tableScroll}><table className={styles.stockTable}>
      <thead><tr><th scope="col">Item</th><th scope="col">On hand</th><th scope="col">Low when below</th><th scope="col">Status</th><th scope="col"><span className={styles.srOnly}>Actions</span></th></tr></thead>
      <tbody>{sorted.map(item => <StockRow key={`${item.id}-${item.version}`} item={item} />)}</tbody>
    </table></div> : <p className={styles.empty}>No supplies yet. Add the first one below.</p>}
    <AddItem />
  </>;
}
