'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveMenuLinkAction } from '@/app/actions/inventory';
import posStyles from '../pos/pos.module.css';
import styles from './inventory.module.css';

type Drink = { id: string; name: string; available: boolean; archivedAt: Date | null; recipeId: string | null; plannedServings: number; logged: number; defaults: string };

export function MenuLinkRow({ eventId, drink, recipes }: { eventId: string; drink: Drink; recipes: { id: string; name: string }[] }) {
  const router = useRouter();
  const [recipeId, setRecipeId] = useState(drink.recipeId ?? ''); const [planned, setPlanned] = useState(drink.plannedServings);
  const [message, setMessage] = useState(''); const [error, setError] = useState(''); const [pending, startTransition] = useTransition();
  const known = !drink.recipeId || recipes.some(recipe => recipe.id === drink.recipeId);
  const dirty = recipeId !== (drink.recipeId ?? '') || planned !== drink.plannedServings;
  return <tr>
    <td>{drink.name}
      <span className={styles.sub}>{drink.archivedAt ? 'Removed from the POS menu' : drink.available ? 'On the POS menu' : 'Temporarily unavailable'} · planned at {drink.defaults}</span>
    </td>
    <td data-label="Recipe"><select aria-label={`Recipe for ${drink.name}`} value={recipeId} disabled={pending} onChange={e => setRecipeId(e.target.value)}>
      <option value="">No recipe — usage not tracked</option>
      {!known && <option value={drink.recipeId!}>Recipe not in the book (unpublished)</option>}
      {recipes.map(recipe => <option key={recipe.id} value={recipe.id}>{recipe.name}</option>)}
    </select></td>
    <td data-label="Planned" className={styles.r}><input type="number" min={0} step={1} inputMode="numeric" aria-label={`Planned servings of ${drink.name}`} value={planned} disabled={pending} onChange={e => setPlanned(Math.max(0, Math.floor(e.target.valueAsNumber || 0)))} /></td>
    <td data-label="Logged in POS" className={styles.r}><strong>{drink.logged}</strong>{planned > 0 && <span className={styles.sub}>{Math.round(drink.logged / planned * 100)}% of plan</span>}</td>
    <td data-label=""><button type="button" className={dirty ? posStyles.primary : posStyles.secondary} disabled={pending || !dirty} onClick={() => startTransition(async () => {
      setError(''); setMessage('');
      try {
        const result = await saveMenuLinkAction({ eventId, menuItemId: drink.id, recipeId: recipeId || null, plannedServings: planned });
        if (!result.ok) { setError(result.error); return; }
        setMessage('Saved.'); router.refresh();
      } catch { setError('Could not confirm the change. Refresh and try again.'); }
    })}>{pending ? 'Saving…' : 'Save'}</button>
      {error && <p role="alert" className={posStyles.error}>{error}</p>}{message && !dirty && <span role="status" className={styles.sub}>{message}</span>}</td>
  </tr>;
}
