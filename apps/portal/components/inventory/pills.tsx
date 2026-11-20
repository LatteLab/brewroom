import { equipmentStatusMeta, fmtQty, stockStatus } from '@/lib/inventory';
import type { equipmentStatuses } from '@/lib/validations/inventory';
import styles from './inventory.module.css';

export function StockPill({ quantity, par }: { quantity: number; par: number }) {
  const status = stockStatus(quantity, par);
  return <span className={`${styles.pill} ${status === 'ok' ? styles.ok : status === 'low' ? styles.warn : styles.bad}`}>{status === 'ok' ? 'OK' : status === 'low' ? 'Low' : 'Out'}</span>;
}
export function NeedPill({ known, enough, short, unit }: { known: boolean; enough: boolean; short: number; unit: string }) {
  if (!known) return <span className={`${styles.pill} ${styles.warn}`}>Not in inventory</span>;
  if (enough) return <span className={`${styles.pill} ${styles.ok}`}>In stock</span>;
  return <span className={`${styles.pill} ${styles.bad}`}>Short {fmtQty(short)} {unit}</span>;
}
export function RecipeStatePill({ state }: { state: 'unpublished' | 'changed' | 'published' }) {
  if (state === 'published') return <span className={`${styles.pill} ${styles.ok}`}>In the book</span>;
  if (state === 'changed') return <span className={`${styles.pill} ${styles.warn}`}>Unpublished edits</span>;
  return <span className={`${styles.pill} ${styles.quiet}`}>Draft</span>;
}
export function EquipmentPill({ status }: { status: (typeof equipmentStatuses)[number] }) {
  const meta = equipmentStatusMeta[status];
  return <span className={`${styles.pill} ${styles[meta.tone]}`}>{meta.label}</span>;
}
