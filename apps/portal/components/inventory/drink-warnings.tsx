import { AlertTriangle } from 'lucide-react';
import { conditionLabels, fmtQty, type DrinkWarning } from '@/lib/inventory';
import styles from './inventory.module.css';

/**
 * The large "running out" warning. Shown on the kiosk, the event plan and the stock page whenever stock can make
 * DRINKS_LEFT_WARNING or fewer more of a drink, naming every ingredient that holds it there.
 */
export function DrinkWarnings({ warnings, eventName, compact = false }: { warnings: (DrinkWarning & { eventName?: string })[]; eventName?: string; compact?: boolean }) {
  if (!warnings.length) return null;
  return <section role="status" aria-label="Drinks running low" className={compact ? `${styles.runningLow} ${styles.runningLowCompact}` : styles.runningLow}>
    <h2><AlertTriangle size={compact ? 22 : 30} aria-hidden="true" />{warnings.length === 1 ? `${warnings[0].name} is running low` : `${warnings.length} drinks are running low`}{eventName ? <span> · {eventName}</span> : null}</h2>
    <ul>{warnings.map(warning => <li key={warning.menuItemId}>
      <strong>{warning.drinksLeft === 0 ? `No more ${warning.name}` : `About ${warning.drinksLeft} ${warning.name} left`}{warning.eventName ? <span> · {warning.eventName}</span> : null}</strong>
      <span>Limited by {warning.limits.map((limit, index) => <span key={limit.item}>{index ? ', ' : ''}<b>{limit.item}</b> ({fmtQty(Math.max(0, limit.onHand))} {limit.unit} left{limit.when !== 'always' ? `, ${conditionLabels[limit.when].toLowerCase()}` : ''})</span>)}.</span>
    </li>)}</ul>
  </section>;
}
