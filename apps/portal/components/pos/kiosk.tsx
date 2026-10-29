'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Coffee, Plus, Minus, Trash2, ArrowRight, RotateCcw, Check } from 'lucide-react';
import { logDrinksAction, refreshPosMenuAction } from '@/app/actions/pos';
import type { PosDrinkLog, PosEvent, PosMenuItem } from '@/lib/db/schema';
import type { Configuration, LogInput } from '@/lib/validations/pos';
import { quantitySchema } from '@/lib/validations/pos';
import { configurationLabel, formatPosDate } from '@/lib/pos';
import { ConfigurationControls } from './configuration-controls';
import { RecentLogs } from './recent-logs';
import styles from './pos.module.css';

type DraftLine = LogInput['lines'][number] & { key: string; name: string };
export function Kiosk({ event, menu, logs, actorId, isAdmin, initialSubmissionId }: { initialSubmissionId: string; event: PosEvent; menu: PosMenuItem[]; logs: PosDrinkLog[]; actorId: string; isAdmin: boolean }) {
  const router = useRouter(); const [currentMenu, setCurrentMenu] = useState(menu); const available = currentMenu.filter(item => item.available); const first = available[0];
  const [selectedId, setSelectedId] = useState(first?.id ?? ''); const selected = available.find(item => item.id === selectedId) ?? first;
  const [configuration, setConfiguration] = useState<Configuration>(first?.options.defaults ?? { temperature: 'Iced', milk: 'Whole', syrup: 100, ice: 'Full' });
  const [quantity, setQuantity] = useState(1); const [lines, setLines] = useState<DraftLine[]>([]); const [kerb, setKerb] = useState('');
  const [submissionId, setSubmissionId] = useState(initialSubmissionId); const [frozen, setFrozen] = useState<LogInput | null>(null); const [pending, startTransition] = useTransition(); const [error, setError] = useState(''); const [saved, setSaved] = useState('');
  const locked = pending || frozen !== null; const total = lines.reduce((sum, line) => sum + line.quantity, 0);
  function choose(item: PosMenuItem) { setSelectedId(item.id); setConfiguration(item.options.defaults); setQuantity(1); }
  function addDrink() {
    if (!selected) return;
    const key = JSON.stringify([selected.id, selected.version, configuration]);
    const existing = lines.find(line => line.key === key);
    if (existing && !quantitySchema.safeParse(existing.quantity + quantity).success) {
      setError('A drink line can contain at most 1,000 drinks. Reduce the quantity before adding it.');
      return;
    }
    setLines(current => current.some(line => line.key === key) ? current.map(line => line.key === key ? { ...line, quantity: line.quantity + quantity } : line) : [...current, { key, name: selected.name, menuItemId: selected.id, menuVersion: selected.version, configuration: { ...configuration }, quantity }]);
    setQuantity(1); setSaved(''); setError('');
  }
  function refreshMenu() {
    if (frozen) return;
    startTransition(async () => {
      try {
        const result = await refreshPosMenuAction(event.id);
        if (!result.ok) { setError(result.error); return; }
        const retained = lines.filter(line => result.menu.some(item => item.id === line.menuItemId && item.available && item.version === line.menuVersion));
        const removed = lines.length - retained.length;
        const selectedItem = result.menu.find(item => item.id === selectedId && item.available) ?? result.menu.find(item => item.available);
        setCurrentMenu(result.menu); setLines(retained); setSubmissionId(crypto.randomUUID()); setError('');
        if (selectedItem) { setSelectedId(selectedItem.id); setConfiguration(selectedItem.options.defaults); setQuantity(1); }
        setSaved(removed ? `Menu refreshed. Removed ${removed} changed or unavailable drink lines. Review and re-add those drinks; the rest of your order and kerb were kept.` : 'Menu refreshed. Review the order before recording.');
        router.refresh();
      } catch { setError('Could not refresh the menu. Your draft has been kept. Try again.'); }
    });
  }
  function save() {
    if (!lines.length) return;
    let input = frozen;
    if (!input) {
      const now = Date.now(); const outside = now < new Date(event.startsAt).getTime() || now >= new Date(event.endsAt).getTime();
      if (outside && !window.confirm('This event is outside its scheduled window. Record this order now? Its timestamp will be the current time.')) return;
      input = { eventId: event.id, submissionId, lines: lines.map(({ menuItemId, menuVersion, configuration, quantity }) => ({ menuItemId, menuVersion, configuration, quantity })), kerb, outsideWindowConfirmed: outside };
      setFrozen(input);
    }
    const request = input; setError('');
    startTransition(async () => {
      try {
        const result = await logDrinksAction(request);
        if (!result.ok) { setError(result.error); if (!result.retryable) setFrozen(null); return; }
        setLines([]); setKerb(''); setFrozen(null); setSubmissionId(crypto.randomUUID()); setQuantity(1); if (selected) setConfiguration(selected.options.defaults);
        setSaved(`Order recorded at ${formatPosDate(result.logs[0].recordedAt, true)}. Ready for the next customer.`); router.refresh();
      } catch { setError('The connection was interrupted. Retry this same order to check whether it was saved.'); }
    });
  }
  return <main className={styles.kiosk}><div className={styles.shell}>
    <header className={styles.header}><Link href="/kiosk" className={styles.brand}><span className={styles.brandMark}><Coffee size={24} /></span><span>latte lab<small>MIT’S COFFEE COMMUNITY.</small></span></Link><div className={styles.headerEvent}><strong>{event.name}</strong><span>{formatPosDate(event.startsAt)} – {formatPosDate(event.endsAt, true)}</span>{isAdmin && <Link href={`/admin/pos/${event.id}`}>Event dashboard</Link>}</div></header>
    <div className={styles.pageHeading}><div><h1>Good drinks. <span>Great company.</span></h1><p>Log orders as they arrive. Every entry helps us understand our events.</p></div><Link className={styles.textLink} href="/kiosk">Change event</Link></div>
    <div className={styles.workspace}>
      <section className={styles.menu}><h2><span>01</span> Pick a drink</h2><fieldset disabled={locked} className={styles.drinkList} aria-label="Available drinks">{available.map((item, index) => <button type="button" key={item.id} aria-pressed={selected?.id === item.id} onClick={() => choose(item)} className={`${styles.drinkCard} ${index % 2 ? styles.apple : styles.pumpkin} ${selected?.id === item.id ? styles.drinkSelected : ''}`}><span className={styles.drinkArt}><Coffee size={72} strokeWidth={1.1} /><span>{selected?.id === item.id ? <Check size={18} /> : <Plus size={18} />}</span></span><strong>{item.name}</strong><small>Make it their way. Double espresso.</small></button>)}</fieldset>{available.length === 0 && <p className={styles.empty}>No drinks are available. Ask the event lead to update the menu.</p>}</section>
      <section className={styles.customize}><h2><span>02</span> Make it theirs</h2>{selected && <fieldset disabled={locked} className={styles.customizeBody}><div className={styles.selectedDrink}><Coffee size={25} /><div><small>YOU’RE MAKING</small><h3>{selected.name}</h3><p>Double espresso</p></div></div><ConfigurationControls value={configuration} options={selected.options} onChange={setConfiguration} /><div className={styles.addRow}><div className={styles.stepper}><button type="button" disabled={quantity === 1} aria-label="Decrease drink quantity" onClick={() => setQuantity(value => value - 1)}><Minus size={16} /></button><span>{quantity}</span><button type="button" disabled={quantity === 1000} aria-label="Increase drink quantity" onClick={() => setQuantity(value => value + 1)}><Plus size={16} /></button></div><button type="button" className={styles.addButton} disabled={lines.length >= 50} onClick={addDrink}>Add to order<Plus size={18} /></button></div><button type="button" className={styles.reset} onClick={() => { setConfiguration(selected.options.defaults); setQuantity(1); }}><RotateCcw size={14} />Reset to defaults</button></fieldset>}</section>
      <section className={styles.orderPanel} aria-labelledby="current-order-heading"><h2 id="current-order-heading"><span>03</span> Current order</h2><div className={styles.receipt}><div className={styles.receiptHeading}><strong>ORDER {submissionId.slice(0, 6).toUpperCase()}</strong><span>{total} {total === 1 ? 'drink' : 'drinks'}</span></div><label className={styles.kerb}>MIT kerb <span>(optional)</span><input disabled={locked} value={kerb} onChange={e => setKerb(e.target.value)} maxLength={64} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="e.g. jdoe" aria-describedby="kerb-hint" /></label><p id="kerb-hint" className={styles.muted}>Leave blank for guests without an MIT kerb.</p>
        <fieldset disabled={locked} className={styles.cart}>{lines.length ? lines.map(line => <article key={line.key} className={styles.cartLine}><div><strong>{line.name}</strong><button type="button" aria-label={`Remove ${line.name}, ${configurationLabel(line.configuration)}`} onClick={() => setLines(current => current.filter(item => item.key !== line.key))}><Trash2 size={16} /></button></div><p>{configurationLabel(line.configuration)}</p><div className={styles.stepper}><button type="button" aria-label={`Decrease ${line.name}, ${configurationLabel(line.configuration)}`} onClick={() => setLines(current => current.map(item => item.key === line.key ? { ...item, quantity: item.quantity - 1 } : item).filter(item => item.quantity > 0))}><Minus size={14} /></button><span>{line.quantity}</span><button type="button" disabled={line.quantity >= 1000} aria-label={`Increase ${line.name}, ${configurationLabel(line.configuration)}`} onClick={() => setLines(current => current.map(item => item.key === line.key ? { ...item, quantity: item.quantity + 1 } : item))}><Plus size={14} /></button></div></article>) : <div className={styles.emptyCart}><Coffee size={35} strokeWidth={1.2} /><h3>A fresh start.</h3><p>Pick a drink, make it theirs,<br />and add it here.</p></div>}</fieldset>
        <div className={styles.receiptBottom}><div><span>Ready to log</span><strong>{total} {total === 1 ? 'drink' : 'drinks'}</strong></div><button className={styles.primary} disabled={pending || !lines.length} onClick={save}>{pending ? 'Recording…' : frozen ? 'Retry same order' : 'Log order'}<ArrowRight size={18} /></button><p>Records the current order time. No payment collected.</p></div></div>
        {error && <><p role="alert" className={styles.error}>{error}</p>{!frozen && <button type="button" disabled={pending} className={styles.secondary} onClick={refreshMenu}>Refresh menu and review order</button>}</>}{frozen && !pending && <p className={styles.muted}>This order is held unchanged until its save is confirmed. Retry before starting another order.</p>}<p role="status" className={styles.saved}>{saved}</p>
      </section>
    </div><RecentLogs logs={logs} isAdmin={isAdmin} actorId={actorId} /><footer className={styles.footer}>BREWED TOGETHER, BY LATTE LAB.</footer>
  </div></main>;
}
