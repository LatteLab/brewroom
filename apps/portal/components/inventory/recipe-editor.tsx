'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUp, X } from 'lucide-react';
import { deleteRecipeAction, discardRecipeDraftAction, publishRecipeAction, saveRecipeDraftAction, unpublishRecipeAction } from '@/app/actions/inventory';
import { conditionLabels, drinkCapacity, drinkCostRange, fmtMoney, fmtQty, recipeState, scaleLabels, workingBody } from '@/lib/inventory';
import { defaultMenuOptions } from '@/lib/validations/pos';
import { CapacitySummary } from './capacity';
import { formatPosDate } from '@/lib/pos';
import { ingredientConditions, ingredientScales, recipeCategories, type RecipeBody } from '@/lib/validations/inventory';
import type { InventoryRecipe } from '@/lib/db/schema';
import { RecipeStatePill } from './pills';
import posStyles from '../pos/pos.module.css';
import styles from './inventory.module.css';

type Stock = { name: string; unit: string; onHand: number; costPerUnit: number };
type Linked = { menuItemId: string; eventId: string; eventName: string; startsAt: Date; drinkName: string };
type Result = { ok: true; recipe?: InventoryRecipe } | { ok: false; error: string };

export function RecipeEditor({ recipe, stock, linked, startEditing }: { recipe: InventoryRecipe; stock: Stock[]; linked: Linked[]; startEditing: boolean }) {
  const router = useRouter();
  const state = recipeState(recipe);
  const [editing, setEditing] = useState<RecipeBody | null>(startEditing ? structuredClone(workingBody(recipe)) : null);
  const [error, setError] = useState(''); const [message, setMessage] = useState(''); const [pending, startTransition] = useTransition();
  const body = editing ?? workingBody(recipe);
  const stockByName = new Map(stock.map(item => [item.name, item]));
  // A recipe is not tied to one event's menu, so it is assessed over every POS choice.
  const capacity = drinkCapacity(body, defaultMenuOptions, stockByName);
  const cost = drinkCostRange(body, defaultMenuOptions, stockByName);
  const names = stock.map(item => item.name).sort((a, b) => a.localeCompare(b));
  const expected = { id: recipe.id, expectedVersion: recipe.version };

  // Every successful action leaves edit mode; `next` navigates away (after a delete) instead of reloading this card.
  const run = (work: () => Promise<Result>, done: string, next?: string) => startTransition(async () => {
    setError(''); setMessage('');
    try {
      const result = await work();
      if (!result.ok) { setError(result.error); return; }
      setMessage(done); setEditing(null);
      if (next) router.push(next); else { router.replace(`/admin/inventory/recipes/${recipe.id}`, { scroll: false }); router.refresh(); }
    } catch { setError('Could not confirm the change. Refresh and try again.'); }
  });
  const edit = (change: (draft: RecipeBody) => void) => setEditing(current => { if (!current) return current; const next = structuredClone(current); change(next); return next; });
  // Publishing from the editor saves the buffer first, so what is on screen is exactly what goes into the book.
  const publish = () => run(async () => {
    let version = recipe.version;
    if (editing) {
      const saved = await saveRecipeDraftAction({ ...expected, body: editing });
      if (!saved.ok) return saved;
      version = saved.recipe.version;
    }
    return publishRecipeAction({ id: recipe.id, expectedVersion: version });
  }, 'Published to the book.');

  return <>
    <Link href="/admin/inventory/recipes" className={posStyles.textLink}>← Recipe book</Link>
    <section className={posStyles.section}>
      <div className={posStyles.sectionTop}>
        {editing ? <div className={styles.dialogGrid} style={{ flex: 1 }}>
          <label>Name<input required maxLength={120} value={editing.name} onChange={e => edit(d => { d.name = e.target.value; })} /></label>
          <label>Category<select value={editing.category} onChange={e => edit(d => { d.category = e.target.value as RecipeBody['category']; })}>{recipeCategories.map(c => <option key={c}>{c}</option>)}</select></label>
        </div> : <div>
          <h2>{body.name || 'Untitled recipe'}</h2>
          <p className={posStyles.muted}>{body.category}{recipe.publishedVersion ? ` · published version ${recipe.publishedVersion}` : ''}{recipe.publishedAt ? ` on ${formatPosDate(recipe.publishedAt)}` : ''}</p>
        </div>}
        <div className={posStyles.actions}>
          <RecipeStatePill state={state} />
          {editing ? <>
            <button type="button" className={posStyles.secondary} disabled={pending} onClick={() => { setEditing(null); setError(''); }}>Cancel</button>
            <button type="button" className={posStyles.secondary} disabled={pending} onClick={() => run(() => saveRecipeDraftAction({ ...expected, body: editing }), 'Draft saved. POS drinks still use the published version.')}>Save draft</button>
            <button type="button" className={posStyles.primary} disabled={pending} onClick={publish}>{state === 'unpublished' ? 'Publish to book' : 'Publish changes'}</button>
          </> : <>
            <button type="button" className={posStyles.secondary} disabled={pending} onClick={() => setEditing(structuredClone(workingBody(recipe)))}>Edit</button>
            {state === 'changed' && <button type="button" className={posStyles.secondary} disabled={pending} onClick={() => { if (window.confirm(`Throw away the unpublished edits and go back to version ${recipe.publishedVersion}?`)) run(() => discardRecipeDraftAction(expected), 'Edits discarded.'); }}>Discard edits</button>}
            {state !== 'published' && <button type="button" className={posStyles.primary} disabled={pending} onClick={publish}>{state === 'unpublished' ? 'Publish to book' : 'Publish changes'}</button>}
            {state === 'published' && <button type="button" className={posStyles.secondary} disabled={pending} onClick={() => { if (window.confirm(`Take “${body.name}” out of the book? It stays here as a draft, but linked POS drinks stop counting stock until it is published again.`)) run(() => unpublishRecipeAction(expected), 'Removed from the book.'); }}>Remove from book</button>}
            <button type="button" className={posStyles.danger} disabled={pending} onClick={() => { if (window.confirm(`Delete “${body.name}” for good? Linked POS drinks will be unlinked. This cannot be undone.`)) run(() => deleteRecipeAction({ id: recipe.id }), 'Recipe deleted.', '/admin/inventory/recipes'); }}>Delete</button>
          </>}
        </div>
      </div>
      {error && <p role="alert" className={posStyles.error}>{error}</p>}
      <p role="status" className={posStyles.muted}>{pending ? 'Saving…' : message}</p>
      {state === 'changed' && !editing && <div className={styles.banner}>This recipe has edits that are not published. Stock usage and event plans still use version {recipe.publishedVersion}.</div>}

      {body.ingredients.length > 0 && <p className={styles.summary}>
        <span>Stock can make <CapacitySummary capacity={capacity} compact /></span>
        <span><strong>{cost.min === cost.max ? fmtMoney(cost.min) : `${fmtMoney(cost.min)}–${fmtMoney(cost.max)}`}</strong> per drink</span>
      </p>}

      <div className={styles.columns}>
        <div>
          <h3>Ingredients <span className={posStyles.muted}>for one drink</span></h3>
          {editing ? <IngredientEditor body={editing} names={names} stock={stockByName} edit={edit} /> : !body.ingredients.length ? <p className={posStyles.empty}>No ingredients yet. Use Edit to add them.</p> : <>
            <div className={styles.tableWrap}><table className={`${styles.table} ${styles.stack}`}>
              <thead><tr><th>Item</th><th className={styles.r}>Amount</th><th className={styles.r}>On hand</th></tr></thead>
              <tbody>{body.ingredients.map((line, index) => { const item = stockByName.get(line.item); return <tr key={index}>
                <td>{line.item}<span className={styles.sub}>{[line.when !== 'always' ? conditionLabels[line.when] : '', line.scale !== 'fixed' ? scaleLabels[line.scale] : '', line.note].filter(Boolean).join(' · ')}</span></td>
                <td data-label="Amount" className={styles.r}>{fmtQty(line.qty)} {item?.unit ?? line.unit}</td>
                <td data-label="On hand" className={styles.r}>{item ? fmtQty(item.onHand) : <span className={`${styles.pill} ${styles.warn}`}>Not in inventory</span>}</td>
              </tr>; })}</tbody>
            </table></div>
            <p className={posStyles.muted}>Amounts are at 100% syrup and full ice. In POS, milk lines follow the milk choice, hot and iced lines the temperature, and syrup and ice lines scale with the order.</p>
          </>}
        </div>
        <div>
          <h3>Method</h3>
          {editing ? <>
            <ol className={styles.steps}>{editing.steps.map((step, index) => <li key={index}><div className={styles.stepEdit}>
              <textarea aria-label={`Step ${index + 1}`} value={step} maxLength={1000} onChange={e => edit(d => { d.steps[index] = e.target.value; })} />
              <div className={styles.stepButtons}>
                <button type="button" className={styles.iconButton} disabled={index === 0} aria-label={`Move step ${index + 1} up`} onClick={() => edit(d => { [d.steps[index - 1], d.steps[index]] = [d.steps[index], d.steps[index - 1]]; })}><ArrowUp size={16} aria-hidden="true" /></button>
                <button type="button" className={styles.iconButton} aria-label={`Remove step ${index + 1}`} onClick={() => edit(d => { d.steps.splice(index, 1); })}><X size={16} aria-hidden="true" /></button>
              </div>
            </div></li>)}</ol>
            <button type="button" className={posStyles.secondary} style={{ marginTop: 8 }} onClick={() => edit(d => { d.steps.push(''); })}>Add step</button>
          </> : body.steps.length ? <ol className={styles.steps} style={{ listStyle: 'decimal' }}>{body.steps.map((step, index) => <li key={index}>{step}</li>)}</ol> : <p className={posStyles.empty}>No method written yet.</p>}
          <h3 style={{ marginTop: 20 }}>Notes</h3>
          {editing ? <textarea className={styles.notes} aria-label="Notes" maxLength={4000} value={editing.notes} placeholder="Anything the next barista should know" onChange={e => edit(d => { d.notes = e.target.value; })} />
            : body.notes ? <p className={posStyles.muted}>{body.notes}</p> : <p className={posStyles.muted}>None.</p>}
        </div>
      </div>
    </section>
    <section className={posStyles.section} aria-labelledby="linked-heading">
      <h2 id="linked-heading">POS drinks using this recipe</h2>
      {linked.length ? <ul className={styles.list}>{linked.map(link => <li key={link.menuItemId}><Link className={posStyles.textLink} href={`/admin/inventory/events/${link.eventId}`}>{link.eventName}</Link> — {link.drinkName} · {formatPosDate(link.startsAt)}</li>)}</ul>
        : <p className={posStyles.muted}>Not linked yet. Link it to a drink under Event planning once it is published.</p>}
    </section>
  </>;
}

function IngredientEditor({ body, names, stock, edit }: { body: RecipeBody; names: string[]; stock: Map<string, Stock>; edit: (change: (draft: RecipeBody) => void) => void }) {
  return <>
    <div className={styles.tableWrap}><table className={`${styles.table} ${styles.stack}`}>
      <thead><tr><th>Item</th><th className={styles.r}>Per serving</th><th>Used for</th><th>Amount</th><th>Note</th><th></th></tr></thead>
      <tbody>{body.ingredients.map((ingredient, index) => {
        const known = stock.get(ingredient.item);
        return <tr key={index}>
          <td><select aria-label={`Ingredient ${index + 1}`} value={ingredient.item} onChange={e => edit(d => { d.ingredients[index].item = e.target.value; d.ingredients[index].unit = stock.get(e.target.value)?.unit ?? ''; })}>
            {!known && <option value={ingredient.item}>{ingredient.item || 'Pick an item'} (not in inventory)</option>}
            {names.map(name => <option key={name}>{name}</option>)}
          </select></td>
          <td data-label="Per serving" className={styles.r}><input type="number" min={0} step="any" inputMode="decimal" aria-label={`Amount per serving of ${ingredient.item}`} value={ingredient.qty} onChange={e => edit(d => { d.ingredients[index].qty = e.target.valueAsNumber || 0; })} /> {known?.unit ?? ingredient.unit}</td>
          <td data-label="Used for"><select aria-label={`When ${ingredient.item} is used`} value={ingredient.when} onChange={e => edit(d => { d.ingredients[index].when = e.target.value as typeof ingredient.when; })}>{ingredientConditions.map(c => <option key={c} value={c}>{conditionLabels[c]}</option>)}</select></td>
          <td data-label="Amount"><select aria-label={`How ${ingredient.item} scales`} value={ingredient.scale} onChange={e => edit(d => { d.ingredients[index].scale = e.target.value as typeof ingredient.scale; })}>{ingredientScales.map(s => <option key={s} value={s}>{scaleLabels[s]}</option>)}</select></td>
          <td data-label="Note"><input maxLength={200} aria-label={`Note for ${ingredient.item}`} value={ingredient.note} placeholder="optional" onChange={e => edit(d => { d.ingredients[index].note = e.target.value; })} /></td>
          <td data-label=""><button type="button" className={styles.iconButton} aria-label={`Remove ${ingredient.item}`} onClick={() => edit(d => { d.ingredients.splice(index, 1); })}><X size={16} aria-hidden="true" /></button></td>
        </tr>;
      })}</tbody>
    </table></div>
    <button type="button" className={posStyles.secondary} style={{ marginTop: 8 }} disabled={!names.length} onClick={() => edit(d => { d.ingredients.push({ item: names[0], qty: 0, unit: stock.get(names[0])?.unit ?? '', note: '', when: 'always', scale: 'fixed' }); })}>Add ingredient</button>
    {!names.length && <p className={posStyles.muted}>Add inventory items first; ingredients are picked from stock so names always match.</p>}
  </>;
}
