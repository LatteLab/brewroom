'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { correctDrinkLogAction, voidDrinkLogAction } from '@/app/actions/pos';
import { configurationLabel, formatPosDate } from '@/lib/pos';
import { defaultMenuOptions, type Configuration } from '@/lib/validations/pos';
import type { PosDrinkLog } from '@/lib/db/schema';
import { ConfigurationControls } from './configuration-controls';
import styles from './pos.module.css';

function LogEditor({ log }: { log: PosDrinkLog }) {
  const router = useRouter(); const [quantity, setQuantity] = useState(log.quantity); const [configuration, setConfiguration] = useState<Configuration>(log.configuration); const [kerb, setKerb] = useState(log.kerb ?? ''); const [reason, setReason] = useState(''); const [error, setError] = useState(''); const [pending, startTransition] = useTransition(); const [mutationId] = useState(() => crypto.randomUUID()); const [held, setHeld] = useState<{ logId: string; mutationId: string; quantity: number; configuration: Configuration; kerb: string; reason: string } | null>(null);
  return <div className={styles.logControls}><button className={styles.danger} type="button" disabled={pending || held !== null} aria-label={`Remove ${log.drinkName} entry`} onClick={() => {
    setError(''); startTransition(async () => {
      try {
        const result = await voidDrinkLogAction({ logId: log.id, reason: 'Accidental entry removed' });
        if (!result.ok) setError(result.error); else router.refresh();
      } catch { setError('Could not confirm removal. Retry to check and remove this entry.'); }
    });
  }}>Remove entry</button><details className={styles.logEditor}><summary>Correct entry</summary><form className={styles.form} onSubmit={e => { e.preventDefault(); setError(''); startTransition(async () => { const request = held ?? { logId: log.id, mutationId, quantity, configuration, kerb, reason }; setHeld(request); try { const result = await correctDrinkLogAction(request); if (!result.ok) { setError(result.error); if (!result.retryable) setHeld(null); return; } router.refresh(); } catch { setError('The connection was interrupted. Retry the same correction to confirm it.'); } }); }}>
    <p className={styles.muted}>The original order time stays unchanged. Changes keep an audit history.</p><fieldset disabled={pending || held !== null}><ConfigurationControls value={configuration} options={defaultMenuOptions} onChange={setConfiguration} /></fieldset>
    <div className={styles.twoColumns}><label>Quantity<input disabled={pending || held !== null} required type="number" min={1} max={1000} value={quantity} onChange={e => setQuantity(e.target.valueAsNumber)} /></label><label>MIT kerb, optional<input disabled={pending || held !== null} value={kerb} maxLength={64} onChange={e => setKerb(e.target.value)} /></label></div>
    <label>Reason<input disabled={pending || held !== null} value={reason} required maxLength={300} onChange={e => setReason(e.target.value)} placeholder="Correcting the milk selection" /></label>
    <button className={styles.primary} type="submit" disabled={pending}>{held ? 'Retry same correction' : 'Save correction'}</button>
  </form></details>{error && <p role="alert" className={styles.error}>{error}</p>}</div>;
}
export function RecentLogs({ logs, isAdmin, actorId }: { logs: PosDrinkLog[]; isAdmin: boolean; actorId: string }) {
  const [visible, setVisible] = useState(20);
  const [showRemoved, setShowRemoved] = useState(false);
  const entries = showRemoved ? logs : logs.filter(log => !log.voidedAt);
  return <section className={styles.section} aria-labelledby="recent-order-heading">
    <div className={styles.sectionTop}>
      <div><h2 id="recent-order-heading">{isAdmin ? 'Order log and history' : 'Your recent entries'}</h2><p className={styles.muted}>Recorded order times are shown in Eastern. Removed entries do not count toward analytics, and their kerbs are cleared.</p></div>
      <label className={styles.historyToggle}><input type="checkbox" checked={showRemoved} onChange={e => { setShowRemoved(e.target.checked); setVisible(20); }} />Show removed entries</label>
    </div>
    {entries.length === 0 ? <p className={styles.empty}>{logs.length ? 'No active entries. Turn on “Show removed entries” to see the history.' : 'No entries yet.'}</p> : <div className={styles.logList}>{entries.slice(0, visible).map(log =>
      <article key={log.id} className={`${styles.log} ${log.voidedAt ? styles.voided : ''}`}>
        <div className={styles.logHeading}><strong>{log.quantity} × {log.drinkName}</strong><time dateTime={new Date(log.recordedAt).toISOString()}>{formatPosDate(log.recordedAt)}</time></div>
        <p>{configurationLabel(log.configuration)}</p>
        <p className={styles.muted}>{log.voidedAt ? 'Kerb cleared' : log.kerb ? `MIT kerb: ${log.kerb}` : 'Guest · no kerb'} · Order {log.submissionId.slice(0, 8)}{log.replacesLogId ? ' · corrected entry' : ''}</p>
        {log.voidedAt ? <p className={styles.muted}>Removed {formatPosDate(log.voidedAt)} · {log.voidReason}</p> : (isAdmin || actorId === log.recordedBy) && <LogEditor log={log} />}
      </article>
    )}</div>}
    {entries.length > visible && <button type="button" className={styles.secondary} onClick={() => setVisible(count => count + 20)}>Show more entries</button>}
  </section>;
}
