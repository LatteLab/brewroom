'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Coffee, Plus, ArrowRight, RotateCcw, Check } from 'lucide-react';
import { logDrinksAction, refreshPosMenuAction } from '@/app/actions/pos';
import type { PosDrinkLog, PosEvent, PosMenuItem } from '@/lib/db/schema';
import type { Configuration, SingleDrinkInput } from '@/lib/validations/pos';
import { configurationLabel, formatPosDate } from '@/lib/pos';
import { ConfigurationControls } from './configuration-controls';
import { RecentLogs } from './recent-logs';
import styles from './pos.module.css';

export function Kiosk({ event, menu, logs, actorId, isAdmin, initialSubmissionId }: { initialSubmissionId: string; event: PosEvent; menu: PosMenuItem[]; logs: PosDrinkLog[]; actorId: string; isAdmin: boolean }) {
  const router = useRouter();
  const [currentMenu, setCurrentMenu] = useState(menu);
  const available = currentMenu.filter(item => item.available);
  const first = available[0];
  const [selectedId, setSelectedId] = useState(first?.id ?? '');
  const selected = available.find(item => item.id === selectedId) ?? first;
  const [configuration, setConfiguration] = useState<Configuration>(first?.options.defaults ?? { temperature: 'Iced', milk: 'Whole', syrup: 100, ice: 'Full' });
  const [kerb, setKerb] = useState('');
  const [submissionId, setSubmissionId] = useState(initialSubmissionId);
  const [frozen, setFrozen] = useState<SingleDrinkInput | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const locked = pending || frozen !== null;

  function choose(item: PosMenuItem) {
    setSelectedId(item.id); setConfiguration(item.options.defaults); setSaved(''); setError('');
  }
  function refreshMenu() {
    if (frozen) return;
    startTransition(async () => {
      try {
        const result = await refreshPosMenuAction(event.id);
        if (!result.ok) { setError(result.error); return; }
        const selectedItem = result.menu.find(item => item.id === selectedId && item.available) ?? result.menu.find(item => item.available);
        setCurrentMenu(result.menu); setSelectedId(selectedItem?.id ?? '');
        if (selectedItem) setConfiguration(selectedItem.options.defaults);
        setSubmissionId(crypto.randomUUID()); setError('');
        setSaved('Menu refreshed. Review the drink and its defaults before logging. Your kerb was kept.');
        router.refresh();
      } catch { setError('Could not refresh the menu. Your selection has been kept. Try again.'); }
    });
  }
  function save(now: number) {
    if (!selected || pending) return;
    let input = frozen;
    if (!input) {
      const outside = now < new Date(event.startsAt).getTime() || now >= new Date(event.endsAt).getTime();
      if (outside && !window.confirm('This event is outside its scheduled window. Record this drink now? Its timestamp will be the current time.')) return;
      input = { eventId: event.id, submissionId, lines: [{ menuItemId: selected.id, menuVersion: selected.version, configuration, quantity: 1 }], kerb, outsideWindowConfirmed: outside };
      setFrozen(input);
    }
    const request = input; setError(''); setSaved('');
    startTransition(async () => {
      try {
        const result = await logDrinksAction(request);
        if (!result.ok) { setError(result.error); if (!result.retryable) setFrozen(null); return; }
        setKerb(''); setFrozen(null); setSubmissionId(crypto.randomUUID()); setConfiguration(selected.options.defaults);
        setSaved(`Drink recorded at ${formatPosDate(result.logs[0].recordedAt, true)}. Ready for the next customer.`);
        router.refresh();
      } catch { setError('The connection was interrupted. Retry this same drink to check whether it was saved.'); }
    });
  }

  return <main className={styles.kiosk}><div className={styles.shell}>
    <header className={styles.header}>
      <Link href="/kiosk" className={styles.brand}><span className={styles.brandMark}><Coffee size={24} /></span><span>latte lab<small>MIT’S COFFEE COMMUNITY.</small></span></Link>
      <div className={styles.headerEvent}><strong>{event.name}</strong><span>{formatPosDate(event.startsAt)} – {formatPosDate(event.endsAt, true)}</span>{isAdmin && <Link href={`/admin/pos/${event.id}`}>Event dashboard</Link>}</div>
    </header>
    <div className={styles.pageHeading}><div><h1>Good drinks. <span>Great company.</span></h1><p>One drink per person. Choose their options, then log it directly.</p></div><Link className={styles.textLink} href="/kiosk">Change event</Link></div>
    <div className={styles.workspace}>
      <section className={styles.menu}>
        <h2><span>01</span> Pick a drink</h2>
        <fieldset disabled={locked} className={styles.drinkList} aria-label="Available drinks">{available.map((item, index) =>
          <button type="button" key={item.id} aria-pressed={selected?.id === item.id} onClick={() => choose(item)} className={`${styles.drinkCard} ${index % 2 ? styles.apple : styles.pumpkin} ${selected?.id === item.id ? styles.drinkSelected : ''}`}>
            <span className={styles.drinkArt}><Coffee size={72} strokeWidth={1.1} /><span>{selected?.id === item.id ? <Check size={18} /> : <Plus size={18} />}</span></span><strong>{item.name}</strong><small>Make it their way. Double espresso.</small>
          </button>
        )}</fieldset>
        {available.length === 0 && <p className={styles.empty}>No drinks are available. Ask the event lead to update the menu.</p>}
      </section>
      <section className={styles.customize}>
        <h2><span>02</span> Make it theirs</h2>
        {selected && <fieldset disabled={locked} className={styles.customizeBody}>
          <div className={styles.selectedDrink}><Coffee size={25} /><div><small>YOU’RE MAKING</small><h3>{selected.name}</h3><p>Double espresso</p></div></div>
          <ConfigurationControls value={configuration} options={selected.options} onChange={setConfiguration} />
          <button type="button" className={styles.reset} onClick={() => setConfiguration(selected.options.defaults)}><RotateCcw size={14} />Reset to defaults</button>
        </fieldset>}
      </section>
      <section className={styles.orderPanel} aria-labelledby="current-order-heading">
        <h2 id="current-order-heading"><span>03</span> Log the drink</h2>
        <div className={styles.receipt}>
          <div className={styles.receiptHeading}><strong>ORDER {submissionId.slice(0, 6).toUpperCase()}</strong><span>{selected ? '1 drink' : 'No drink selected'}</span></div>
          <div className={styles.drinkSummary}>{selected ? <><h3>{selected.name}</h3><p>{configurationLabel(configuration)}</p></> : <p>Choose an available drink to get started.</p>}</div>
          <label className={styles.kerb}>MIT kerb <span>(optional)</span><input disabled={locked} value={kerb} onChange={e => setKerb(e.target.value)} maxLength={64} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="e.g. jdoe" aria-describedby="kerb-hint" /></label>
          <p id="kerb-hint" className={styles.muted}>Leave blank for guests without an MIT kerb.</p>
          <div className={styles.receiptBottom}>
            <button className={styles.primary} disabled={pending || !selected} onClick={() => save(Date.now())}>{pending ? 'Recording…' : frozen ? 'Retry same drink' : 'Log drink'}<ArrowRight size={18} /></button>
            <p>Records the current order time. No payment collected.</p>
          </div>
        </div>
        {error && <><p role="alert" className={styles.error}>{error}</p>{!frozen && <button type="button" disabled={pending} className={styles.secondary} onClick={refreshMenu}>Refresh menu and review drink</button>}</>}
        {frozen && !pending && <p className={styles.muted}>This drink is held unchanged until its save is confirmed. Retry before starting another entry.</p>}
        <p role="status" className={styles.saved}>{saved}</p>
      </section>
    </div>
    <RecentLogs logs={logs} isAdmin={isAdmin} actorId={actorId} />
    <footer className={styles.footer}>BREWED TOGETHER, BY LATTE LAB.</footer>
  </div></main>;
}
