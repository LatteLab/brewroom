'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteInventoryItemAction, saveInventoryItemAction } from '@/app/actions/inventory';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { itemCategories, units, type ItemFields } from '@/lib/validations/inventory';
import type { InventoryItem } from '@/lib/db/schema';
import posStyles from '../pos/pos.module.css';
import styles from './inventory.module.css';

const blank: ItemFields = { name: '', category: 'Other', unit: 'ml', bagSize: 0, sealedBags: 0, openBag: 0, par: 0, costPerUnit: 0, supplier: '', notes: '' };
const numberFields = [
  ['bagSize', 'Units per sealed bag'], ['sealedBags', 'Sealed bags on hand'], ['openBag', 'Units in the open bag'], ['par', 'Par level (reorder at)'], ['costPerUnit', 'Cost per unit ($)'],
] as const;

function toFields(item: InventoryItem): ItemFields {
  const { name, category, unit, bagSize, sealedBags, openBag, par, costPerUnit, supplier, notes } = item;
  return { name, category, unit, bagSize, sealedBags, openBag, par, costPerUnit, supplier, notes };
}

export function ItemDialog({ item }: { item?: InventoryItem }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<ItemFields>(item ? toFields(item) : blank);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof ItemFields>(key: K, value: ItemFields[K]) => setFields(current => ({ ...current, [key]: value }));
  const run = (work: () => Promise<{ ok: boolean; error?: string }>) => startTransition(async () => {
    setError('');
    try { const result = await work(); if (!result.ok) { setError(result.error ?? 'That did not save.'); return; } setOpen(false); router.refresh(); }
    catch { setError('Could not confirm the change. Refresh and try again.'); }
  });

  return <Dialog open={open} onOpenChange={value => { if (pending) return; setOpen(value); setError(''); if (value) setFields(item ? toFields(item) : blank); }}>
    <DialogTrigger asChild><button type="button" className={item ? posStyles.secondary : posStyles.primary} aria-label={item ? `Edit ${item.name}` : undefined}>{item ? 'Edit' : 'Add item'}</button></DialogTrigger>
    <DialogContent className={posStyles.deleteDialog} showCloseButton={!pending}>
      <DialogHeader>
        <DialogTitle>{item ? 'Edit item' : 'Add item'}</DialogTitle>
        <DialogDescription>Quantity on hand is bag size × sealed bags + open bag, so it is never typed directly. Changing the counts records a new count.{item ? ' Renaming updates every recipe that uses this item.' : ''}</DialogDescription>
      </DialogHeader>
      <form onSubmit={e => { e.preventDefault(); run(() => saveInventoryItemAction(item ? { ...fields, id: item.id, expectedVersion: item.version } : fields)); }}>
        <div className={styles.dialogGrid}>
          <label>Item name<input required maxLength={160} value={fields.name} onChange={e => set('name', e.target.value)} /></label>
          <label>Category<select value={fields.category} onChange={e => set('category', e.target.value as ItemFields['category'])}>{itemCategories.map(c => <option key={c}>{c}</option>)}</select></label>
          <label>Unit used in recipes<select value={fields.unit} onChange={e => set('unit', e.target.value as ItemFields['unit'])}>{units.map(u => <option key={u}>{u}</option>)}</select></label>
          {numberFields.map(([key, label]) => <label key={key}>{label}<input type="number" inputMode="decimal" min={0} step="any" required value={fields[key]} onChange={e => set(key, e.target.valueAsNumber || 0)} /></label>)}
          <label>Supplier<input maxLength={160} value={fields.supplier} onChange={e => set('supplier', e.target.value)} /></label>
          <label>Notes<input maxLength={1000} value={fields.notes} placeholder="1 pump ≈ 10 ml" onChange={e => set('notes', e.target.value)} /></label>
        </div>
        {error && <p role="alert" className={posStyles.error}>{error}</p>}
        <DialogFooter className="mt-4">
          {item && <button type="button" className={posStyles.danger} disabled={pending} onClick={() => {
            if (!window.confirm(`Delete “${item.name}”? Recipes that use it will show it as not in inventory.`)) return;
            run(() => deleteInventoryItemAction({ id: item.id }));
          }}>Delete item</button>}
          <button type="button" className={posStyles.secondary} disabled={pending} onClick={() => setOpen(false)}>Cancel</button>
          <button type="submit" className={posStyles.primary} disabled={pending}>{pending ? 'Saving…' : item ? 'Save' : 'Add item'}</button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
