'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { countInventoryItemAction } from '@/app/actions/inventory';
import { countedQuantity, fmtQty, packageLabel, stockStatus, unitCost } from '@/lib/inventory';
import { POS_TIMEZONE, formatPosDate } from '@/lib/pos';
import { itemCategories } from '@/lib/validations/inventory';
import type { StockRow } from '@/lib/db/inventory-queries';
import { ItemDialog } from './item-dialog';
import { StockPill } from './pills';
import posStyles from '../pos/pos.module.css';
import styles from './inventory.module.css';

const shortDate = new Intl.DateTimeFormat('en-US', { timeZone: POS_TIMEZONE, month: 'short', day: 'numeric' });

function CountRow({ item }: { item: StockRow }) {
  const router = useRouter();
  const [sealed, setSealed] = useState<Record<string, number>>(Object.fromEntries(item.packages.map(option => [option.id, option.sealedBags])));
  const [openAmount, setOpenAmount] = useState(item.openAmount);
  const [message, setMessage] = useState(''); const [pending, startTransition] = useTransition();
  const draft = { openAmount, packages: item.packages.map(option => ({ bagSize: option.bagSize, sealedBags: sealed[option.id] ?? option.sealedBags })) };
  const changed = openAmount !== item.openAmount || item.packages.some(option => sealed[option.id] !== option.sealedBags);
  const save = () => startTransition(async () => {
    setMessage('');
    try {
      const result = await countInventoryItemAction({ id: item.id, expectedVersion: item.version, openAmount, packages: item.packages.map(option => ({ id: option.id, sealedBags: sealed[option.id] ?? option.sealedBags })) });
      if (!result.ok) { setMessage(result.error); return; }
      router.refresh();
    } catch { setMessage('Could not confirm the count. Refresh and try again.'); }
  });
  const number = (label: string, value: number, change: (value: number) => void) => <input type="number" min={0} step="any" inputMode="decimal" aria-label={label} value={value} disabled={pending} onChange={e => change(e.target.valueAsNumber || 0)} />;
  return <tr className={stockStatus(item.onHand, item.par) === 'ok' ? undefined : styles.short}>
    <td>{item.name}<span className={styles.sub}>{item.category} · ${unitCost(item.packages).toLocaleString('en-US', { maximumFractionDigits: 4 })} per {item.unit}{item.notes ? ` · ${item.notes}` : ''}</span></td>
    <td data-label="Count"><div className={styles.countGroup}>
      {item.packages.map(option => <label key={option.id}>{packageLabel(option, item.unit)}{number(`Sealed bags of ${item.name}, ${packageLabel(option, item.unit)}`, sealed[option.id] ?? 0, value => setSealed(current => ({ ...current, [option.id]: value })))}</label>)}
      <label>Open, {item.unit}{number(`Open amount of ${item.name}`, openAmount, setOpenAmount)}</label>
    </div></td>
    <td data-label="On hand" className={styles.r}><strong>{fmtQty(changed ? countedQuantity(draft) : item.onHand)} {item.unit}</strong>
      <span className={styles.sub} title={`Counted ${fmtQty(item.counted)} ${item.unit} on ${formatPosDate(item.countedAt)}`}>{changed ? 'New count, not saved' : item.usedSinceCount ? `${fmtQty(item.usedSinceCount)} used since the ${shortDate.format(item.countedAt)} count` : `Counted ${shortDate.format(item.countedAt)}`}</span>
      {!changed && item.onHand < 0 && <span className={styles.sub}>Usage exceeds the count: recount</span>}</td>
    <td data-label="Status"><StockPill quantity={item.onHand} par={item.par} />{item.par > 0 && <span className={styles.sub} style={{ whiteSpace: 'nowrap' }}>par {fmtQty(item.par)}</span>}</td>
    <td data-label=""><div className={posStyles.actions}>
      <button type="button" className={changed ? posStyles.primary : posStyles.secondary} disabled={pending} onClick={save} aria-label={`Save count for ${item.name}`} title="Records a count now, even if the numbers did not change">{pending ? 'Saving…' : 'Save count'}</button>
      <ItemDialog item={item} />
    </div>{message && <p role="alert" className={posStyles.error}>{message}</p>}</td>
  </tr>;
}

export function StockTable({ items }: { items: StockRow[] }) {
  const [search, setSearch] = useState(''); const [category, setCategory] = useState('all'); const [lowOnly, setLowOnly] = useState(false);
  const q = search.trim().toLowerCase();
  const shown = items.filter(item => (!q || item.name.toLowerCase().includes(q) || item.packages.some(option => option.supplier.toLowerCase().includes(q))) && (category === 'all' || item.category === category) && (!lowOnly || stockStatus(item.onHand, item.par) !== 'ok'));
  return <>
    <div className={styles.toolbar}>
      <label>Search<input type="search" value={search} placeholder="Item or supplier" onChange={e => setSearch(e.target.value)} /></label>
      <label>Category<select value={category} onChange={e => setCategory(e.target.value)}><option value="all">All</option>{itemCategories.map(c => <option key={c}>{c}</option>)}</select></label>
      <label className={styles.toggle}><input type="checkbox" checked={lowOnly} onChange={e => setLowOnly(e.target.checked)} />At or below par only</label>
      <div style={{ marginLeft: 'auto' }}><ItemDialog /></div>
    </div>
    {!shown.length ? <p className={posStyles.empty}>{items.length ? 'No items match those filters.' : 'No items yet. Add one, or import the prototype’s data file under Import / export.'}</p> :
      <div className={styles.tableWrap}><table className={`${styles.table} ${styles.stack}`}>
        <thead><tr><th>Item</th><th>Count (sealed bags, open)</th><th className={styles.r}>On hand</th><th>Status</th><th></th></tr></thead>
        <tbody>{shown.map(item => <CountRow key={`${item.id}-${item.version}`} item={item} />)}</tbody>
      </table></div>}
  </>;
}
