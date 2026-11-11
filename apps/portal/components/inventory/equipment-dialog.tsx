'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteEquipmentAction, saveEquipmentAction } from '@/app/actions/inventory';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { equipmentStatusMeta } from '@/lib/inventory';
import { equipmentCategories, equipmentStatuses, type EquipmentFields } from '@/lib/validations/inventory';
import type { InventoryEquipment } from '@/lib/db/schema';
import posStyles from '../pos/pos.module.css';
import styles from './inventory.module.css';

const blank: EquipmentFields = { name: '', category: 'Tools', quantity: 1, status: 'ok', location: '', custodian: '', serial: '', notes: '', lastCheckedAt: '' };
function toFields(item: InventoryEquipment): EquipmentFields {
  const { name, category, quantity, status, location, custodian, serial, notes, lastCheckedAt } = item;
  return { name, category, quantity, status, location, custodian, serial, notes, lastCheckedAt };
}
const textFields = [['location', 'Where it lives'], ['custodian', 'Looked after by'], ['serial', 'Serial or asset tag'], ['notes', 'Notes']] as const;

export function EquipmentDialog({ item }: { item?: InventoryEquipment }) {
  const router = useRouter();
  const [open, setOpen] = useState(false); const [fields, setFields] = useState<EquipmentFields>(item ? toFields(item) : blank);
  const [error, setError] = useState(''); const [pending, startTransition] = useTransition();
  const set = <K extends keyof EquipmentFields>(key: K, value: EquipmentFields[K]) => setFields(current => ({ ...current, [key]: value }));
  const run = (work: () => Promise<{ ok: boolean; error?: string }>) => startTransition(async () => {
    setError('');
    try { const result = await work(); if (!result.ok) { setError(result.error ?? 'That did not save.'); return; } setOpen(false); router.refresh(); }
    catch { setError('Could not confirm the change. Refresh and try again.'); }
  });
  return <Dialog open={open} onOpenChange={value => { if (pending) return; setOpen(value); setError(''); if (value) setFields(item ? toFields(item) : blank); }}>
    <DialogTrigger asChild><button type="button" className={item ? posStyles.secondary : posStyles.primary} aria-label={item ? `Edit ${item.name}` : undefined}>{item ? 'Edit' : 'Add equipment'}</button></DialogTrigger>
    <DialogContent className={posStyles.deleteDialog} showCloseButton={!pending}>
      <DialogHeader><DialogTitle>{item ? 'Edit equipment' : 'Add equipment'}</DialogTitle>
        <DialogDescription>Equipment is not consumed, so there is no par level or bag count. Anything not marked Ready counts as zero available.</DialogDescription></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); run(() => saveEquipmentAction(item ? { ...fields, id: item.id, expectedVersion: item.version } : fields)); }}>
        <div className={styles.dialogGrid}>
          <label>Item name<input required maxLength={160} value={fields.name} onChange={e => set('name', e.target.value)} /></label>
          <label>Category<select value={fields.category} onChange={e => set('category', e.target.value as EquipmentFields['category'])}>{equipmentCategories.map(c => <option key={c}>{c}</option>)}</select></label>
          <label>How many we own<input type="number" min={0} step={1} required value={fields.quantity} onChange={e => set('quantity', Math.max(0, Math.floor(e.target.valueAsNumber || 0)))} /></label>
          <label>Condition<select value={fields.status} onChange={e => set('status', e.target.value as EquipmentFields['status'])}>{equipmentStatuses.map(s => <option key={s} value={s}>{equipmentStatusMeta[s].label}</option>)}</select></label>
          {textFields.map(([key, label]) => <label key={key}>{label}<input maxLength={key === 'notes' ? 1000 : 200} value={fields[key]} onChange={e => set(key, e.target.value)} /></label>)}
          <label>Last checked<input type="date" value={fields.lastCheckedAt} onChange={e => set('lastCheckedAt', e.target.value)} /></label>
        </div>
        {error && <p role="alert" className={posStyles.error}>{error}</p>}
        <DialogFooter className="mt-4">
          {item && <button type="button" className={posStyles.danger} disabled={pending} onClick={() => { if (window.confirm(`Delete “${item.name}” from the register?`)) run(() => deleteEquipmentAction({ id: item.id })); }}>Delete</button>}
          <button type="button" className={posStyles.secondary} disabled={pending} onClick={() => setOpen(false)}>Cancel</button>
          <button type="submit" className={posStyles.primary} disabled={pending}>{pending ? 'Saving…' : item ? 'Save' : 'Add equipment'}</button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
