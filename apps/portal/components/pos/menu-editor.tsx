'use client';

import { useState, useTransition } from 'react';
import { Reorder, useDragControls } from 'framer-motion';
import { GripVertical } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { removePosMenuItemAction, reorderPosMenuAction, savePosMenuItemAction } from '@/app/actions/pos';
import { defaultMenuOptions, iceLevels, milks, syrups, temperatures, type MenuOptions } from '@/lib/validations/pos';
import type { PosMenuItem } from '@/lib/db/schema';
import { ConfigurationControls } from './configuration-controls';
import styles from './pos.module.css';

function Choices<T extends string | number>({ label, all, values, change }: { label: string; all: readonly T[]; values: T[]; change: (values: T[]) => void }) {
  return <fieldset className={styles.allowed}><legend>{label}</legend>{all.map(value => <label key={value}><input type="checkbox" checked={values.includes(value)} disabled={values.length === 1 && values.includes(value)} onChange={() => change(values.includes(value) ? values.filter(v => v !== value) : all.filter(v => values.includes(v) || v === value))} />{value}{label === 'Syrup' ? '%' : ''}</label>)}</fieldset>;
}
function normalizeDefaults(options: MenuOptions): MenuOptions {
  const temperature = options.temperatures.includes(options.defaults.temperature) ? options.defaults.temperature : options.temperatures[0] ?? 'Iced';
  const milk = options.milks.includes(options.defaults.milk) ? options.defaults.milk : options.milks[0] ?? 'Whole';
  const syrup = options.syrups.includes(options.defaults.syrup) ? options.defaults.syrup : options.syrups[0] ?? 100;
  const ice = options.defaults.temperature === 'Iced' && options.iceLevels.includes(options.defaults.ice) ? options.defaults.ice : options.iceLevels[0] ?? 'Full';
  return { ...options, defaults: temperature === 'Hot' ? { temperature, milk, syrup } : { temperature, milk, syrup, ice } };
}
function MenuItemForm({ eventId, item }: { eventId: string; item?: PosMenuItem }) {
  const router = useRouter(); const [name, setName] = useState(item?.name ?? ''); const [available, setAvailable] = useState(item?.available ?? true);
  const [options, setOptions] = useState<MenuOptions>(item?.options ?? structuredClone(defaultMenuOptions));
  const [pending, startTransition] = useTransition(); const [message, setMessage] = useState(''); const [error, setError] = useState('');
  return <details className={styles.menuEdit} open={!item}><summary>{item?.name ?? 'Add a drink'} <span>{item ? item.available ? 'Available' : 'Unavailable' : '+'}</span></summary><form className={styles.form} onSubmit={e => { e.preventDefault(); setError(''); setMessage(''); startTransition(async () => { const result = await savePosMenuItemAction({ eventId, ...(item ? { id: item.id, expectedVersion: item.version } : {}), name, options, available }); if (!result.ok) { setError(result.error); return; } setMessage('Menu saved.'); if (!item) setName(''); router.refresh(); }); }}>
    <label>Drink name<input required maxLength={120} value={name} onChange={e => setName(e.target.value)} /></label>
    <label className={styles.checkbox}><input type="checkbox" checked={available} onChange={e => setAvailable(e.target.checked)} />Available to order</label>
    <p className={styles.muted}>Choose what staff can offer. Espresso is always double.</p>
    <Choices label="Temperature" all={temperatures} values={options.temperatures} change={temperatures => setOptions(normalizeDefaults({ ...options, temperatures }))} />
    <Choices label="Milk" all={milks} values={options.milks} change={milks => setOptions(normalizeDefaults({ ...options, milks }))} />
    <Choices label="Syrup" all={syrups} values={options.syrups} change={syrups => setOptions(normalizeDefaults({ ...options, syrups }))} />
    <Choices label="Ice" all={iceLevels} values={options.iceLevels} change={iceLevels => setOptions(normalizeDefaults({ ...options, iceLevels }))} />
    <h4>Default configuration</h4><ConfigurationControls options={options} value={options.defaults} onChange={defaults => setOptions({ ...options, defaults })} />
    {error && <p role="alert" className={styles.error}>{error}</p>}{message && <p role="status">{message}</p>}<div className={styles.actions}><button type="submit" disabled={pending} className={styles.primary}>{pending ? 'Working…' : 'Save drink'}</button>
      {item && <button type="button" disabled={pending} className={styles.danger} aria-label={`Remove ${item.name} from menu`} onClick={() => {
        if (!window.confirm(`Remove “${item.name}” from this event’s menu? Past orders and analytics will be kept.`)) return;
        setError(''); setMessage('');
        startTransition(async () => {
          try {
            const result = await removePosMenuItemAction({ eventId, id: item.id, expectedVersion: item.version });
            if (!result.ok) { setError(result.error); return; }
            router.refresh();
          } catch { setError('Could not confirm removal. Retry to check and remove this drink.'); }
        });
      }}>Remove drink</button>}
    </div>
  </form></details>;
}
function SortableDrink({ eventId, item, pending, move, save }: { eventId: string; item: PosMenuItem; pending: boolean; move: (direction: -1 | 1) => void; save: () => void }) {
  const controls = useDragControls();
  return <Reorder.Item value={item} className={styles.sortableDrink} dragListener={false} dragControls={controls} onDragEnd={save}>
    <button type="button" className={styles.dragHandle} aria-disabled={pending} aria-label={`Reorder ${item.name}`} aria-describedby="menu-reorder-help" onPointerDown={event => { if (!pending) controls.start(event); }} onKeyDown={event => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      event.preventDefault(); move(event.key === 'ArrowUp' ? -1 : 1);
    }}><GripVertical size={18} aria-hidden="true" /></button>
    <MenuItemForm key={item.version} eventId={eventId} item={item} />
  </Reorder.Item>;
}
export function MenuEditor({ eventId, menu }: { eventId: string; menu: PosMenuItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState(menu);
  const [previousMenu, setPreviousMenu] = useState(menu);
  if (menu !== previousMenu) { setPreviousMenu(menu); setItems(menu); }
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState(''); const [error, setError] = useState('');
  function save(next = items) {
    const itemIds = next.map(item => item.id);
    if (pending || itemIds.every((id, index) => id === menu[index]?.id)) return;
    setMessage(''); setError('');
    startTransition(async () => {
      try {
        const result = await reorderPosMenuAction({ eventId, itemIds, expectedItemIds: menu.map(item => item.id) });
        if (!result.ok) { setError(result.error); setItems(menu); }
        else setMessage('Menu order saved.');
      } catch { setError('Could not confirm the menu order. Refresh and try again.'); setItems(menu); }
      router.refresh();
    });
  }
  function move(id: string, direction: -1 | 1) {
    const next = [...items]; const index = next.findIndex(item => item.id === id); const target = index + direction;
    if (pending || index < 0 || target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]]; setItems(next); save(next);
  }
  return <section className={styles.section}><h2>Event menu</h2><p className={styles.muted}>Edit drink names, choices, and defaults here. Changes apply to new orders; existing entries keep their original specifications.</p>
    {items.length === 0 && <p className={styles.empty}>This menu is empty. Add a drink below to start taking orders.</p>}
    <p className={styles.muted}>Remove a drink to take it off this event’s menu and kiosk. Past orders and analytics are kept.</p>
    <p id="menu-reorder-help" className={styles.muted}>Drag a drink’s handle to change its kiosk position. With a handle focused, use the up and down arrow keys. Order saves automatically.</p>
    <Reorder.Group axis="y" values={items} onReorder={setItems} className={styles.menuOrder} aria-label="Drinks in kiosk order">{items.map(item => <SortableDrink key={item.id} eventId={eventId} item={item} pending={pending} move={direction => move(item.id, direction)} save={() => save()} />)}</Reorder.Group>
    <p role="status" className={styles.muted}>{pending ? 'Saving menu order…' : message}</p>{error && <p role="alert" className={styles.error}>{error}</p>}
    <MenuItemForm eventId={eventId} />
  </section>;
}
