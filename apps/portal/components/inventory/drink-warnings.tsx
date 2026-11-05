import { AlertTriangle } from 'lucide-react';
import type { DrinkWarning } from '@/lib/inventory';
import { capacityPhrase, limitPhrase } from './capacity';
import styles from './inventory.module.css';

/**
 * The large "running out" warning. Shown on the kiosk, the event plan and the stock page whenever stock can make
 * DRINKS_LEFT_WARNING or fewer more of a drink type, naming the ingredients that hold it there.
 */
export function DrinkWarnings({ warnings, compact = false }: { warnings: (DrinkWarning & { eventName?: string })[]; compact?: boolean }) {
  if (!warnings.length) return null;
  return <section role="status" aria-label="Drinks running low" className={compact ? `${styles.runningLow} ${styles.runningLowCompact}` : styles.runningLow}>
    <h2><AlertTriangle size={compact ? 22 : 28} aria-hidden="true" />{warnings.length === 1 ? `${warnings[0].name} is running low` : `${warnings.length} drinks are running low`}</h2>
    <ul>{warnings.map(warning => <li key={warning.menuItemId}>
      {(warnings.length > 1 || warning.eventName) && <strong>{warnings.length > 1 ? warning.name : null}{warning.eventName ? <span>{warnings.length > 1 ? ' · ' : ''}{warning.eventName}</span> : null}</strong>}
      {warning.groups.map(group => <span key={group.label}>{group.drinksLeft === 0 ? `None left${group.label ? ` (${group.label})` : ''}` : `About ${capacityPhrase(group, ' left')}`} — {group.limits.map(limitPhrase).join(', ')}</span>)}
    </li>)}</ul>
  </section>;
}
