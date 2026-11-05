'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { deleteInventoryItemAction, saveInventoryItemAction } from '@/app/actions/inventory';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { countedQuantity, fmtQty, unitCost } from '@/lib/inventory';
import { itemCategories, units, type ItemFields, type PackageFields } from '@/lib/validations/inventory';
import type { InventoryItem, InventoryItemPackage } from '@/lib/db/schema';
import posStyles from '../pos/pos.module.css';
import styles from './inventory.module.css';

type Item = InventoryItem & { packages: InventoryItemPackage[] };
const blankOption: PackageFields = { supplier: '', bagSize: 0, costPerBag: 0, sealedBags: 0, preferred: true };
const blank: ItemFields = { name: '', category: 'Other', unit: 'ml', openAmount: 0, par: 0, notes: '', packages: [blankOption] };
function toFields(item: Item): ItemFields {
  const { name, category, unit, openAmount, par, notes } = item;
  return { name, category, unit, openAmount, par, notes, packages: item.packages.map(({ id, supplier, bagSize, costPerBag, sealedBags, preferred }) => ({ id, supplier, bagSize, costPerBag, sealedBags, preferred })) };
}
const money = (value: number) => `$${value.toLocaleString('en-US', { maximumFractionDigits: 4 })}`;

export function ItemDialog({ item }: { item?: Item }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<ItemFields>(item ? toFields(item) : blank);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof ItemFields>(key: K, value: ItemFields[K]) => setFields(current => ({ ...current, [key]: value }));
  const setOption = (index: number, change: Partial<PackageFields>) => setFields(current => ({
    ...current, packages: current.packages.map((option, i) => i === index ? { ...option, ...change } : change.preferred ? { ...option, preferred: false } : option),
  }));
  const run = (work: () => Promise<{ ok: boolean; error?: string }>) => startTransition(async () => {
    setError('');
    try { const result = await work(); if (!result.ok) { setError(result.error ?? 'That did not save.'); return; } setOpen(false); router.refresh(); }
    catch { setError('Could not confirm the change. Refresh and try again.'); }
  });
  const perUnit = unitCost(fields.packages.filter(option => option.bagSize > 0));

  return <Dialog open={open} onOpenChange={value => { if (pending) return; setOpen(value); setError(''); if (value) setFields(item ? toFields(item) : blank); }}>
    <DialogTrigger asChild><button type="button" className={item ? posStyles.secondary : posStyles.primary} aria-label={item ? `Edit ${item.name}` : undefined}>{item ? 'Edit' : 'Add item'}</button></DialogTrigger>
    <DialogContent className={`${posStyles.deleteDialog} sm:max-w-3xl`} showCloseButton={!pending}>
      <DialogHeader>
        <DialogTitle>{item ? 'Edit item' : 'Add item'}</DialogTitle>
        <DialogDescription>One item per ingredient that recipes use. If you buy it in more than one size or from more than one supplier, add each as a purchase option rather than a separate item. Quantity on hand is the sealed bags of every option plus the open amount.{item ? ' Renaming updates every recipe that uses this item.' : ''}</DialogDescription>
      </DialogHeader>
      <form onSubmit={e => { e.preventDefault(); run(() => saveInventoryItemAction(item ? { ...fields, id: item.id, expectedVersion: item.version } : fields)); }}>
        <div className={styles.dialogGrid}>
          <label>Item name<input required maxLength={160} value={fields.name} placeholder="Whole milk" onChange={e => set('name', e.target.value)} /></label>
          <label>Category<select value={fields.category} onChange={e => set('category', e.target.value as ItemFields['category'])}>{itemCategories.map(c => <option key={c}>{c}</option>)}</select></label>
          <label>Unit used in recipes<select value={fields.unit} onChange={e => set('unit', e.target.value as ItemFields['unit'])}>{units.map(u => <option key={u}>{u}</option>)}</select></label>
          <label>Par level, {fields.unit} (reorder at)<input type="number" inputMode="decimal" min={0} step="any" required value={fields.par} onChange={e => set('par', e.target.valueAsNumber || 0)} /></label>
          <label>Open amount, {fields.unit}<input type="number" inputMode="decimal" min={0} step="any" required value={fields.openAmount} onChange={e => set('openAmount', e.target.valueAsNumber || 0)} /></label>
          <label>Notes<input maxLength={1000} value={fields.notes} placeholder="1 pump ≈ 10 ml" onChange={e => set('notes', e.target.value)} /></label>
        </div>
        <fieldset style={{ marginTop: 16 }}>
          <legend className="text-sm font-semibold">Purchase options</legend>
          <p className={posStyles.muted}>Enter what one bag costs; the cost per {fields.unit} is worked out for you. The preferred option is what shopping lists buy.</p>
          {fields.packages.map((option, index) => <div className={styles.optionRow} key={option.id ?? `new-${index}`}>
            <label>Supplier<input maxLength={160} value={option.supplier} placeholder="Costco" onChange={e => setOption(index, { supplier: e.target.value })} /></label>
            <label>Bag size, {fields.unit}<input type="number" inputMode="decimal" min={0} step="any" required value={option.bagSize} onChange={e => setOption(index, { bagSize: e.target.valueAsNumber || 0 })} /></label>
            <label>Cost per bag ($)<input type="number" inputMode="decimal" min={0} step="any" required value={option.costPerBag} onChange={e => setOption(index, { costPerBag: e.target.valueAsNumber || 0 })} />
              <span className={styles.sub}>{option.bagSize > 0 ? `${money(option.costPerBag / option.bagSize)} per ${fields.unit}` : 'Enter a bag size'}</span></label>
            <label>Sealed bags<input type="number" inputMode="decimal" min={0} step="any" required value={option.sealedBags} onChange={e => setOption(index, { sealedBags: e.target.valueAsNumber || 0 })} /></label>
            <label className={styles.radio}><input type="radio" name="preferred" checked={option.preferred} onChange={() => setOption(index, { preferred: true })} />Preferred</label>
            <button type="button" className={styles.iconButton} aria-label={`Remove purchase option ${index + 1}`} onClick={() => setFields(current => ({ ...current, packages: current.packages.filter((_, i) => i !== index) }))}><X size={16} aria-hidden="true" /></button>
          </div>)}
          <button type="button" className={posStyles.secondary} onClick={() => setFields(current => ({ ...current, packages: [...current.packages, { ...blankOption, preferred: !current.packages.length }] }))}>Add purchase option</button>
          <p className={posStyles.muted} style={{ marginTop: 8 }}>On hand {fmtQty(countedQuantity({ openAmount: fields.openAmount, packages: fields.packages }))} {fields.unit} · average {money(perUnit)} per {fields.unit}</p>
        </fieldset>
        {error && <p role="alert" className={posStyles.error}>{error}</p>}
        <DialogFooter className="mt-4">
          {item && <button type="button" className={posStyles.danger} disabled={pending} onClick={() => {
            if (!window.confirm(`Delete “${item.name}” and its purchase options? Recipes that use it will show it as not in inventory.`)) return;
            run(() => deleteInventoryItemAction({ id: item.id }));
          }}>Delete item</button>}
          <button type="button" className={posStyles.secondary} disabled={pending} onClick={() => setOpen(false)}>Cancel</button>
          <button type="submit" className={posStyles.primary} disabled={pending}>{pending ? 'Saving…' : item ? 'Save' : 'Add item'}</button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
