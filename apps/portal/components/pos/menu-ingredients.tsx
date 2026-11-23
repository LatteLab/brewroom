'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { saveMenuIngredientsAction } from '@/app/actions/inventory';
import { conditionLabels, ingredientConditions, type IngredientLine } from '@/lib/validations/inventory';
import type { InventoryItem, PosMenuIngredient } from '@/lib/db/schema';
import styles from './pos.module.css';

type Draft = Omit<IngredientLine, 'quantity'> & { quantity: string };
const toDraft = (line: PosMenuIngredient): Draft => ({ itemId: line.itemId, quantity: String(line.quantity), appliesWhen: line.appliesWhen, scalesWithSyrup: line.scalesWithSyrup });

export function MenuIngredients({ eventId, menuItemId, stock, lines }: { eventId: string; menuItemId: string; stock: InventoryItem[]; lines: PosMenuIngredient[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<Draft[]>(lines.map(toDraft));
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState(''); const [error, setError] = useState('');
  const update = (index: number, patch: Partial<Draft>) => { setRows(rows.map((row, i) => i === index ? { ...row, ...patch } : row)); setMessage(''); };
  const unitOf = (itemId: string) => stock.find(item => item.id === itemId)?.unit ?? '';

  if (!stock.length) return <div className={styles.ingredients}><h4>Ingredients</h4><p className={styles.muted}>Add supplies on the <Link href="/admin/inventory" className={styles.textLink}>Inventory</Link> page first, then list what this drink uses.</p></div>;

  return <div className={styles.ingredients}>
    <h4>Ingredients</h4>
    <p className={styles.muted}>Amounts for one drink. Used only to estimate usage; logging a drink never changes stock.</p>
    {rows.map((row, index) => <fieldset key={index} className={styles.ingredientRow} disabled={pending}>
      <legend className={styles.srOnly}>Ingredient {index + 1}</legend>
      <label>Item<select value={row.itemId} onChange={e => update(index, { itemId: e.target.value })}>{stock.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Amount{unitOf(row.itemId) && ` (${unitOf(row.itemId)})`}<input inputMode="decimal" value={row.quantity} onChange={e => update(index, { quantity: e.target.value })} /></label>
      <label>When<select value={row.appliesWhen} onChange={e => update(index, { appliesWhen: e.target.value as Draft['appliesWhen'] })}>{ingredientConditions.map(condition => <option key={condition} value={condition}>{conditionLabels[condition]}</option>)}</select></label>
      <label className={styles.checkbox}><input type="checkbox" checked={row.scalesWithSyrup} onChange={e => update(index, { scalesWithSyrup: e.target.checked })} />Scales with syrup</label>
      <button type="button" className={styles.secondary} onClick={() => setRows(rows.filter((_, i) => i !== index))} aria-label={`Remove ingredient ${index + 1}`}>Remove</button>
    </fieldset>)}
    {error && <p role="alert" className={styles.error}>{error}</p>}{message && <p role="status" className={styles.muted}>{message}</p>}
    <div className={styles.actions}>
      <button type="button" className={styles.secondary} disabled={pending} onClick={() => setRows([...rows, { itemId: stock[0].id, quantity: '', appliesWhen: 'always', scalesWithSyrup: false }])}>Add ingredient</button>
      <button type="button" className={styles.primary} disabled={pending} onClick={() => {
        setError(''); setMessage('');
        const ingredients = rows.map(row => ({ ...row, quantity: Number(row.quantity) }));
        if (ingredients.some(line => !(line.quantity > 0))) { setError('Every ingredient needs an amount greater than zero.'); return; }
        startTransition(async () => {
          const result = await saveMenuIngredientsAction({ eventId, menuItemId, ingredients });
          if (!result.ok) { setError(result.error); return; }
          setMessage('Ingredients saved.'); router.refresh();
        });
      }}>{pending ? 'Saving…' : 'Save ingredients'}</button>
    </div>
  </div>;
}
