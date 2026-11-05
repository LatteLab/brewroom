import { fmtQty, type CapacityGroup, type DrinkCapacity } from '@/lib/inventory';
import styles from './inventory.module.css';

/** "9 with oat milk", "15 hot", "9 iced, oat milk", or just "42" when every choice allows the same. */
export function capacityPhrase(group: CapacityGroup, suffix = '') {
  if (!group.label) return `${group.drinksLeft}${suffix}`;
  return group.label.endsWith('milk') && !group.label.includes(',') ? `${group.drinksLeft}${suffix} with ${group.label}` : `${group.drinksLeft} ${group.label}${suffix}`;
}
export function limitPhrase(limit: CapacityGroup['limits'][number]) { return `${limit.item} (${fmtQty(Math.max(0, limit.onHand))} ${limit.unit})`; }

/** How many more of a drink stock makes, by the choices that matter, with what runs out first. */
export function CapacitySummary({ capacity, compact = false, stacked = false }: { capacity: DrinkCapacity | null; compact?: boolean; stacked?: boolean }) {
  if (!capacity || capacity.drinksLeft === null) return <span className={styles.sub}>Not tracked</span>;
  const first = capacity.groups[0];
  return <span>
    {stacked ? capacity.groups.map(group => <strong key={group.label} style={{ display: 'block' }}>{capacityPhrase(group)}</strong>) : <strong>{capacity.groups.map(group => capacityPhrase(group)).join(' · ')}</strong>}
    {!compact && first.limits[0] && <span className={styles.sub}>{first.limits[0].item} runs out first{capacity.missing.length ? ` · ${capacity.missing.length} not in inventory` : ''}</span>}
  </span>;
}
