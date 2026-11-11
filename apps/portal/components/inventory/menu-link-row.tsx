'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveMenuLinkAction } from '@/app/actions/inventory';
import type { DrinkCapacity, LinkSource } from '@/lib/inventory';
import { CapacitySummary } from './capacity';
import posStyles from '../pos/pos.module.css';
import styles from './inventory.module.css';

type Drink = { id: string; name: string; available: boolean; archivedAt: Date | null; source: LinkSource; pinnedRecipeId: string | null; recipeInUse: string | null; plannedServings: number; logged: number; capacity: DrinkCapacity | null };
const choiceFor = (drink: Drink) => drink.source === 'off' ? 'none' : drink.source === 'pinned' ? drink.pinnedRecipeId! : 'auto';

export function MenuLinkRow({ eventId, drink, recipes }: { eventId: string; drink: Drink; recipes: { id: string; name: string }[] }) {
  const router = useRouter();
  const [choice, setChoice] = useState(choiceFor(drink)); const [planned, setPlanned] = useState(drink.plannedServings);
  const [message, setMessage] = useState(''); const [error, setError] = useState(''); const [pending, startTransition] = useTransition();
  const pinnedMissing = drink.source === 'pinned' && !recipes.some(recipe => recipe.id === drink.pinnedRecipeId);
  const dirty = choice !== choiceFor(drink) || planned !== drink.plannedServings;
  const status = drink.source === 'off' ? 'Not tracked'
    : drink.recipeInUse ? `Using “${drink.recipeInUse}”`
      : drink.source === 'pinned' ? 'Pinned recipe is not published, so nothing is deducted'
        : drink.source === 'ambiguous' ? 'Two published recipes have this name. Pick one.'
          : 'No published recipe with this name';
  return <tr>
    <td>{drink.name}{(drink.archivedAt || !drink.available) && <span className={styles.sub}>{drink.archivedAt ? 'Removed from the menu' : 'Unavailable'}</span>}</td>
    <td data-label="Recipe"><div><select aria-label={`Recipe for ${drink.name}`} value={choice} disabled={pending} onChange={e => setChoice(e.target.value)}>
      <option value="auto">Match by name{drink.source === 'auto' && drink.recipeInUse ? ` (${drink.recipeInUse})` : ''}</option>
      {pinnedMissing && <option value={drink.pinnedRecipeId!}>Pinned recipe (unpublished)</option>}
      {recipes.map(recipe => <option key={recipe.id} value={recipe.id}>{recipe.name}</option>)}
      <option value="none">Don’t track this drink</option>
    </select><span className={styles.sub}>{status}</span></div></td>
    <td data-label="Can make now"><CapacitySummary capacity={drink.archivedAt ? null : drink.capacity} stacked /></td>
    <td data-label="Logged" className={styles.r}><strong>{drink.logged}</strong></td>
    <td data-label="Planned" className={styles.r}><input type="number" min={0} step={1} inputMode="numeric" aria-label={`Planned servings of ${drink.name}`} value={planned} disabled={pending} onChange={e => setPlanned(Math.max(0, Math.floor(e.target.valueAsNumber || 0)))} />
      {planned > 0 && <span className={styles.sub}>{Math.round(drink.logged / planned * 100)}% logged</span>}</td>
    <td data-label=""><button type="button" className={dirty ? posStyles.primary : posStyles.secondary} disabled={pending || !dirty} onClick={() => startTransition(async () => {
      setError(''); setMessage('');
      try {
        const result = await saveMenuLinkAction({ eventId, menuItemId: drink.id, recipe: choice, plannedServings: planned });
        if (!result.ok) { setError(result.error); return; }
        setMessage('Saved.'); router.refresh();
      } catch { setError('Could not confirm the change. Refresh and try again.'); }
    })}>{pending ? 'Saving…' : 'Save'}</button>
      {error && <p role="alert" className={posStyles.error}>{error}</p>}{message && !dirty && <span role="status" className={styles.sub}>{message}</span>}</td>
  </tr>;
}
