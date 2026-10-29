import type { buildAnalytics } from '@/lib/pos';
import styles from './pos.module.css';

type BreakdownReport = Pick<ReturnType<typeof buildAnalytics>, 'totalDrinks' | 'drinks' | 'breakdowns'>;

export function PosBreakdowns({ report }: { report: BreakdownReport }) {
  if (!report.totalDrinks) return <p className={styles.empty}>Record an order to see drink and option breakdowns.</p>;

  return <div className={styles.breakdownGrid}>
    <div><h3>Drinks</h3>{report.drinks.map(drink =>
      <p className={styles.breakdownRow} key={drink.id}><span>{drink.name}</span><strong>{drink.count} · {(drink.count / report.totalDrinks * 100).toFixed(0)}%</strong></p>
    )}</div>
    {Object.entries(report.breakdowns).map(([name, choices]) => <div key={name}>
      <h3>{name}</h3>{Object.entries(choices).map(([choice, count]) =>
        <p className={styles.breakdownRow} key={choice}><span>{choice}</span><strong>{count} · {(count / report.totalDrinks * 100).toFixed(0)}%</strong></p>
      )}
    </div>)}
  </div>;
}
