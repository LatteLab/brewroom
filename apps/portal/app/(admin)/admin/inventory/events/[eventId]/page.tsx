import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireInventoryAdmin } from '@/lib/inventory-access';
import { getEventInventory } from '@/lib/db/inventory-queries';
import { demandRows, eventPlan, fmtMoney, fmtQty, stockMap, usageFromLogs } from '@/lib/inventory';
import { formatPosDate } from '@/lib/pos';
import { MenuLinkRow } from '@/components/inventory/menu-link-row';
import { NeedPill } from '@/components/inventory/pills';
import { DrinkWarnings } from '@/components/inventory/drink-warnings';
import posStyles from '@/components/pos/pos.module.css';
import styles from '@/components/inventory/inventory.module.css';
export const dynamic = 'force-dynamic';

export default async function EventInventoryPage({ params }: { params: Promise<{ eventId: string }> }) {
  const actor = await requireInventoryAdmin(); const { eventId } = await params;
  if (!z.uuid().safeParse(eventId).success) notFound();
  const view = await getEventInventory(actor, eventId); if (!view) notFound();
  const { event, menu, items, recipes, refs, logs, links, warnings } = view;
  const stock = stockMap(items);
  const plan = eventPlan(menu.filter(drink => !drink.archivedAt).map(drink => ({ menuItemId: drink.id, name: drink.name, defaults: drink.options.defaults, plannedServings: drink.plannedServings })), links, refs, stock);
  const usage = usageFromLogs(logs, links, refs);
  const used = demandRows(usage.byItem, stock);
  const published = recipes.filter(recipe => recipe.published).map(recipe => ({ id: recipe.id, name: recipe.published!.name })).sort((a, b) => a.name.localeCompare(b.name));
  const totalLogged = logs.reduce((sum, log) => sum + log.quantity, 0);
  const untracked = usage.drinksUnlinked + usage.drinksUnpublished;
  const planned = menu.some(drink => drink.plannedServings > 0);

  return <>
    <Link href="/admin/inventory/events" className={posStyles.textLink}>← Event planning</Link>
    <section className={posStyles.section}>
      <div className={posStyles.sectionTop}>
        <div><h2>{event.name}</h2><p className={posStyles.muted}>{formatPosDate(event.startsAt)} – {formatPosDate(event.endsAt, true)}</p></div>
        <div className={posStyles.actions}><Link href={`/admin/pos/${event.id}#menu`} className={posStyles.secondary}>Edit POS menu</Link><Link href={`/kiosk/${event.id}`} className={posStyles.secondary}>Open order logger</Link></div>
      </div>
      <DrinkWarnings warnings={warnings} />
      <h3>Drinks</h3>
      <p className={posStyles.muted}>Each POS drink uses the published recipe with the same name. Change it only when the names differ. “Can make” is what current stock allows, by the choices that matter.</p>
      {menu.length ? <div className={styles.tableWrap}><table className={`${styles.table} ${styles.stack}`}>
        <thead><tr><th>Drink</th><th>Recipe</th><th>Can make now</th><th className={styles.r}>Logged</th><th className={styles.r}>Planned</th><th></th></tr></thead>
        <tbody>{menu.map(drink => <MenuLinkRow key={`${drink.id}-${drink.source}-${drink.recipeId}-${drink.plannedServings}`} eventId={event.id} recipes={published}
          drink={{ id: drink.id, name: drink.name, available: drink.available, archivedAt: drink.archivedAt, source: drink.source, pinnedRecipeId: drink.recipeId, recipeInUse: drink.recipeInUse ? refs.get(drink.recipeInUse)?.name ?? null : null, plannedServings: drink.plannedServings, logged: drink.logged, capacity: drink.capacity }} />)}</tbody>
      </table></div> : <p className={posStyles.empty}>This event has no drinks yet. <Link className={posStyles.textLink} href={`/admin/pos/${event.id}#menu`}>Add drinks in POS</Link>.</p>}
      {!published.length && <div className={styles.banner}>Nothing is published in the recipe book yet. <Link className={posStyles.textLink} href="/admin/inventory/recipes">Publish a recipe</Link> to track these drinks.</div>}
    </section>

    <section className={posStyles.section} aria-labelledby="plan-heading">
      <h2 id="plan-heading">Shopping list</h2>
      {!planned ? <p className={posStyles.muted}>Enter planned servings above to see what this event needs and what to buy. Plans use each drink’s default choices.</p> : <>
        {(plan.unlinked.length > 0 || plan.unpublished.length > 0) && <div className={styles.banner}>Not counted because they have no published recipe: {[...plan.unlinked, ...plan.unpublished].join(', ')}.</div>}
        <p className={styles.summary}>
          <span><strong>{plan.drinks}</strong> drinks planned</span>
          <span><strong>{plan.short.length}</strong> {plan.short.length === 1 ? 'ingredient' : 'ingredients'} short</span>
          <span><strong>{fmtMoney(plan.cost)}</strong> ingredients{plan.drinks > 0 ? ` (${fmtMoney(plan.cost / plan.drinks)} a drink)` : ''}</span>
        </p>
        {plan.rows.length > 0 && <div className={styles.tableWrap}><table className={`${styles.table} ${styles.stack}`}>
          <thead><tr><th>Item</th><th className={styles.r}>Needed</th><th className={styles.r}>On hand</th><th>Stock</th><th>Buy</th></tr></thead>
          <tbody>{plan.rows.map(row => <tr key={row.item} className={row.known && !row.enough ? styles.short : undefined}>
            <td>{row.item}</td>
            <td data-label="Needed" className={styles.r}><span><strong>{fmtQty(row.needed)}</strong> {row.unit}</span></td>
            <td data-label="On hand" className={styles.r}>{row.onHand === null ? '—' : fmtQty(row.onHand)}</td>
            <td data-label="Stock"><NeedPill {...row} /></td>
            <td data-label="Buy">{!row.known ? 'Add to inventory' : row.enough ? '' : row.buyBags ? `${row.buyBags} × ${row.buyLabel}` : `${fmtQty(row.short)} ${row.unit}`}</td>
          </tr>)}</tbody>
        </table></div>}
      </>}
    </section>

    <section className={posStyles.section} aria-labelledby="usage-heading">
      <h2 id="usage-heading">Used so far</h2>
      {!totalLogged ? <p className={posStyles.muted}>No orders logged for this event yet.</p> : <>
        <p className={styles.summary}>
          <span><strong>{totalLogged}</strong> drinks logged</span>
          <span><strong>{fmtMoney(used.reduce((sum, row) => sum + row.cost, 0))}</strong> in ingredients</span>
          {untracked > 0 && <span><strong>{untracked}</strong> not tracked (no published recipe)</span>}
        </p>
        {used.length > 0 && <details className={posStyles.dataTable}><summary>Ingredients used ({used.length})</summary>
          <div className={styles.tableWrap}><table className={styles.table}>
            <thead><tr><th>Item</th><th className={styles.r}>Used</th><th className={styles.r}>Cost</th></tr></thead>
            <tbody>{used.map(row => <tr key={row.item}><td>{row.item}{!row.known && <span className={styles.sub}>Not in inventory</span>}</td><td className={styles.r}>{fmtQty(row.needed)} {row.unit}</td><td className={styles.r}>{fmtMoney(row.cost)}</td></tr>)}</tbody>
          </table></div>
        </details>}
      </>}
    </section>
  </>;
}
