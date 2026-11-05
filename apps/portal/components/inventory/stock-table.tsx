'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { countInventoryItemAction } from '@/app/actions/inventory';
import { countedQuantity, fmtQty, stockStatus } from '@/lib/inventory';
import { formatPosDate } from '@/lib/pos';
import { itemCategories } from '@/lib/validations/inventory';
import type { StockRow } from '@/lib/db/inventory-queries';
import { ItemDialog } from './item-dialog';
import { StockPill } from './pills';
import posStyles from '../pos/pos.module.css';
import styles from './inventory.module.css';

function CountRow({ item }: { item: StockRow }) {
  const router = useRouter();
  const [sealed, setSealed] = useState(item.sealedBags); const [openBag, setOpenBag] = useState(item.openBag);
  const [message, setMessage] = useState(''); const [pending, startTransition] = useTransition();
  const preview = countedQuantity({ bagSize: item.bagSize, sealedBags: sealed, openBag });
  const changed = sealed !== item.sealedBags || openBag !== item.openBag;
  const save = () => startTransition(async () => {
    setMessage('');
    try {
      const result = await countInventoryItemAction({ id: item.id, expectedVersion: item.version, sealedBags: sealed, openBag });
      if (!result.ok) { setMessage(result.error); return; }
      router.refresh();
    } catch { setMessage('Could not confirm the count. Refresh and try again.'); }
  });
  return <tr className={stockStatus(item.onHand, item.par) === 'ok' ? undefined : styles.short}>
    <td>{item.name}{item.notes && <span className={styles.sub}>{item.notes}</span>}<span className={styles.sub}>{item.category} · {item.unit}{item.bagSize > 0 ? ` · bag of ${fmtQty(item.bagSize)}` : ''}</span></td>
    <td data-label="Sealed bags" className={styles.r}><input type="number" min={0} step="any" inputMode="decimal" aria-label={`Sealed bags of ${item.name}`} value={sealed} disabled={pending} onChange={e => setSealed(e.target.valueAsNumber || 0)} /></td>
    <td data-label="Open bag" className={styles.r}><input type="number" min={0} step="any" inputMode="decimal" aria-label={`Units in the open bag of ${item.name}`} value={openBag} disabled={pending} onChange={e => setOpenBag(e.target.valueAsNumber || 0)} /></td>
    <td data-label="Counted" className={styles.r}><strong>{fmtQty(changed ? preview : item.counted)}</strong><span className={styles.sub} title={formatPosDate(item.countedAt)}>{changed ? 'not saved' : formatPosDate(item.countedAt)}</span></td>
    <td data-label="Used since count" className={styles.r}>{item.usedSinceCount ? `−${fmtQty(item.usedSinceCount)}` : '—'}</td>
    <td data-label="Estimated on hand" className={styles.r}><strong>{fmtQty(item.onHand)}</strong>{item.onHand < 0 && <span className={styles.sub}>Recount: usage exceeds the count</span>}</td>
    <td data-label="Par" className={styles.r}>{fmtQty(item.par)}</td>
    <td data-label="Status"><StockPill quantity={item.onHand} par={item.par} /></td>
    <td data-label=""><div className={posStyles.actions}>
      <button type="button" className={posStyles.primary} disabled={pending} onClick={save} aria-label={`Save count for ${item.name}`} title="Records a new count now, even if the numbers did not change">{pending ? 'Saving…' : 'Save count'}</button>
      <ItemDialog item={item} />
    </div>{message && <p role="alert" className={posStyles.error}>{message}</p>}</td>
  </tr>;
}

export function StockTable({ items }: { items: StockRow[] }) {
  const [search, setSearch] = useState(''); const [category, setCategory] = useState('all'); const [lowOnly, setLowOnly] = useState(false);
  const q = search.trim().toLowerCase();
  const shown = items.filter(item => (!q || item.name.toLowerCase().includes(q)) && (category === 'all' || item.category === category) && (!lowOnly || stockStatus(item.onHand, item.par) !== 'ok'));
  return <>
    <div className={styles.toolbar}>
      <label>Search<input type="search" value={search} placeholder="Item name" onChange={e => setSearch(e.target.value)} /></label>
      <label>Category<select value={category} onChange={e => setCategory(e.target.value)}><option value="all">All</option>{itemCategories.map(c => <option key={c}>{c}</option>)}</select></label>
      <label className={styles.toggle}><input type="checkbox" checked={lowOnly} onChange={e => setLowOnly(e.target.checked)} />At or below par only</label>
      <div style={{ marginLeft: 'auto' }}><ItemDialog /></div>
    </div>
    {!shown.length ? <p className={posStyles.empty}>{items.length ? 'No items match those filters.' : 'No items yet. Add one, or import the prototype’s data file under Import / export.'}</p> :
      <div className={styles.tableWrap}><table className={`${styles.table} ${styles.stack}`}>
        <thead><tr><th>Item</th><th className={styles.r}>Sealed bags</th><th className={styles.r}>Open bag</th><th className={styles.r}>Counted</th><th className={styles.r}>Used since count</th><th className={styles.r}>Estimated on hand</th><th className={styles.r}>Par</th><th>Status</th><th></th></tr></thead>
        <tbody>{shown.map(item => <CountRow key={`${item.id}-${item.version}`} item={item} />)}</tbody>
      </table></div>}
  </>;
}
