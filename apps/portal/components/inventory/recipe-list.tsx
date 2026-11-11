'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createRecipeAction } from '@/app/actions/inventory';
import { recipeName, recipeState, workingBody } from '@/lib/inventory';
import { recipeCategories } from '@/lib/validations/inventory';
import type { InventoryRecipe } from '@/lib/db/schema';
import { RecipeStatePill } from './pills';
import posStyles from '../pos/pos.module.css';
import styles from './inventory.module.css';

export function RecipeList({ recipes }: { recipes: InventoryRecipe[] }) {
  const router = useRouter();
  const [search, setSearch] = useState(''); const [status, setStatus] = useState('all'); const [category, setCategory] = useState('all');
  const [name, setName] = useState(''); const [error, setError] = useState(''); const [pending, startTransition] = useTransition();
  const q = search.trim().toLowerCase();
  const shown = recipes.filter(recipe => {
    const body = workingBody(recipe); const state = recipeState(recipe);
    return (!q || body.name.toLowerCase().includes(q)) && (category === 'all' || body.category === category)
      && (status === 'all' || (status === 'published' ? state !== 'unpublished' : state !== 'published'));
  }).sort((a, b) => recipeName(a).localeCompare(recipeName(b)));
  return <>
    <form className={styles.toolbar} onSubmit={e => { e.preventDefault(); setError(''); startTransition(async () => {
      try { const result = await createRecipeAction({ name }); if (!result.ok) { setError(result.error); return; } router.push(`/admin/inventory/recipes/${result.recipe.id}?edit=1`); }
      catch { setError('Could not confirm the new recipe. Refresh and try again.'); }
    }); }}>
      <label>New recipe<input required maxLength={120} value={name} placeholder="Drink name" onChange={e => setName(e.target.value)} /></label>
      <button type="submit" className={posStyles.primary} disabled={pending}>{pending ? 'Creating…' : 'Create draft'}</button>
    </form>
    {error && <p role="alert" className={posStyles.error}>{error}</p>}
    <div className={styles.toolbar}>
      <label>Search<input type="search" value={search} placeholder="Recipe name" onChange={e => setSearch(e.target.value)} /></label>
      <label>Status<select value={status} onChange={e => setStatus(e.target.value)}><option value="all">All</option><option value="published">In the book</option><option value="draft">Drafts and edits</option></select></label>
      <label>Category<select value={category} onChange={e => setCategory(e.target.value)}><option value="all">All</option>{recipeCategories.map(c => <option key={c}>{c}</option>)}</select></label>
    </div>
    {!shown.length ? <p className={posStyles.empty}>{recipes.length ? 'No recipes match those filters.' : 'No recipes yet. Create a draft above, or import the prototype’s data file.'}</p> :
      <div className={styles.grid}>{shown.map(recipe => {
        const body = workingBody(recipe); const state = recipeState(recipe);
        return <Link key={recipe.id} href={`/admin/inventory/recipes/${recipe.id}`} className={`${styles.card} ${state === 'unpublished' ? styles.draft : ''}`}>
          <h3>{body.name || 'Untitled recipe'}</h3>
          <div className={styles.meta}><RecipeStatePill state={state} /><span>{body.category}</span><span>{body.ingredients.length} ingredients</span><span>{body.steps.length} steps</span></div>
        </Link>;
      })}</div>}
  </>;
}
