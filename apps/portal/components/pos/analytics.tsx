import Link from 'next/link';
import { buildAnalytics, type AnalyticsLog } from '@/lib/pos';
import type { PosEvent } from '@/lib/db/schema';
import { PosBreakdowns } from './breakdowns';
import styles from './pos.module.css';

export function PosAnalytics({ event, logs, interval }: { event: PosEvent; logs: AnalyticsLog[]; interval: 5 | 15 }) {
  const report = buildAnalytics(logs, event, interval); const max = Math.max(1, ...report.buckets.map(bucket => bucket.drinks)); const peak = report.buckets.reduce((best, value) => value.drinks > best.drinks ? value : best, report.buckets[0]);
  const gapSeconds = report.averageOrderGapMs === null ? null : Math.round(report.averageOrderGapMs / 1000);
  const gapLabel = gapSeconds === null ? '—' : gapSeconds < 60 ? `${gapSeconds}s` : `${Math.floor(gapSeconds / 60)}m ${gapSeconds % 60}s`;
  return <section className={styles.section} aria-labelledby="analytics-heading"><div className={styles.sectionTop}><div><h2 id="analytics-heading">Drink analytics</h2><p className={styles.muted}>Based on when staff recorded orders, not preparation or handoff times.</p></div><a href={`/admin/pos/${event.id}/export`} className={styles.secondary}>Export CSV</a></div>
    <div className={styles.stats}><div><span>Drinks ordered</span><strong>{report.totalDrinks}</strong></div><div><span>Orders recorded</span><strong>{report.totalOrders}</strong></div><div><span>Average time between orders</span><strong>{gapLabel}</strong></div><div><span>Within-window drinks / elapsed hour</span><strong>{report.averagePerHour === null ? '—' : report.averagePerHour.toFixed(1)}</strong></div><div><span>Outside planned window</span><strong>{report.outsideWindowDrinks}</strong></div></div>
    <p className={styles.muted}>Time between orders averages the gaps between consecutive recorded orders, including orders outside the planned window. Multiple drinks in one order count once; at least two orders are needed.</p>
    <div className={styles.sectionTop}><h3>Recorded order activity</h3><div className={styles.actions}><Link href={`/admin/pos/${event.id}?interval=5`} aria-current={interval === 5 ? 'page' : undefined} className={styles.secondary}>5 minutes</Link><Link href={`/admin/pos/${event.id}?interval=15`} aria-current={interval === 15 ? 'page' : undefined} className={styles.secondary}>15 minutes</Link></div></div>
    <p className={styles.muted}>Eastern time. {report.intervalMinutes}-minute intervals. Empty intervals count as zero; the chart includes outside-window entries.{report.totalDrinks > 0 && peak ? ` Peak: ${peak.drinks} drinks at ${peak.label}.` : ''}</p>
    <div className={styles.chart} role="img" aria-label={`Drinks per ${report.intervalMinutes}-minute interval. ${report.totalDrinks} drinks recorded.`}>{report.buckets.map(bucket => <div className={styles.barColumn} key={bucket.at} title={`${bucket.label}: ${bucket.drinks} drinks, ${bucket.orders} orders`}><span>{bucket.drinks || ''}</span><div className={styles.bar} style={{ height: `${Math.max(bucket.drinks ? 3 : 0, bucket.drinks / max * 135)}px` }} /><small>{bucket.label}</small></div>)}</div>
    <details className={styles.dataTable}><summary>View chart data as a table</summary><table><thead><tr><th>Interval starts, Eastern</th><th>Drinks</th><th>Orders</th></tr></thead><tbody>{report.buckets.map(bucket => <tr key={bucket.at}><td>{bucket.label}</td><td>{bucket.drinks}</td><td>{bucket.orders}</td></tr>)}</tbody></table></details>
    <PosBreakdowns report={report} />
  </section>;
}
