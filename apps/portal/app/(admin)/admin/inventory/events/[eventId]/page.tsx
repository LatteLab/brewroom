import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireInventoryAdmin } from '@/lib/inventory-access';
import { getEventInventory } from '@/lib/db/inventory-queries';
import { demandRows, eventPlan, fmtMoney, fmtQty, stockMap, usageFromLogs } from '@/lib/inventory';
import { configurationLabel, formatPosDate } from '@/lib/pos';
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

  return <>
    <Link href="/admin/inventory/events" className={posStyles.textLink}>← Event planning</Link>
    <section className={posStyles.section}>
      <div className={posStyles.sectionTop}>
        <div><h2>{event.name}</h2><p className={posStyles.muted}>{formatPosDate(event.startsAt)} – {formatPosDate(event.endsAt)}. The menu below is read live from POS; add, rename or remove drinks in the POS tab.</p></div>
        <div className={posStyles.actions}><Link href={`/admin/pos/${event.id}#menu`} className={posStyles.secondary}>Edit POS menu</Link><Link href={`/kiosk/${event.id}`} className={posStyles.secondary}>Open order logger</Link></div>
      </div>
      <DrinkWarnings warnings={warnings} />
      <h3>Drinks and recipes</h3>
      <p className={posStyles.muted}>Each POS drink uses the published recipe with the same name automatically, so its logged orders deduct stock with no setup. Pick a different recipe, or stop tracking a drink, only when the names differ. Planned servings are estimated at each drink’s default choices, because the real mix of hot/iced and milk is only known once orders come in.</p>
      {menu.length ? <div className={styles.tableWrap}><table className={`${styles.table} ${styles.stack}`}>
        <thead><tr><th>POS drink</th><th>Recipe</th><th className={styles.r}>Planned</th><th className={styles.r}>Logged in POS</th><th></th></tr></thead>
        <tbody>{menu.map(drink => <MenuLinkRow key={`${drink.id}-${drink.source}-${drink.recipeId}-${drink.plannedServings}`} eventId={event.id} recipes={published}
          drink={{ id: drink.id, name: drink.name, available: drink.available, archivedAt: drink.archivedAt, source: drink.source, pinnedRecipeId: drink.recipeId, recipeInUse: drink.recipeInUse ? refs.get(drink.recipeInUse)?.name ?? null : null, plannedServings: drink.plannedServings, logged: drink.logged, defaults: configurationLabel(drink.options.defaults) }} />)}</tbody>
      </table></div> : <p className={posStyles.empty}>This POS event has no drinks yet. <Link className={posStyles.textLink} href={`/admin/pos/${event.id}#menu`}>Add drinks in POS</Link>, then link them here.</p>}
      {!published.length && <div className={styles.banner}>Nothing is published in the recipe book yet. <Link className={posStyles.textLink} href="/admin/inventory/recipes">Publish a recipe</Link> to link it here.</div>}
    </section>

    <section className={posStyles.section} aria-labelledby="plan-heading">
      <h2 id="plan-heading">Plan against stock</h2>
      {(plan.unlinked.length > 0 || plan.unpublished.length > 0) && <div className={styles.banner}>
        {plan.unlinked.length > 0 && <>Planned but with no recipe (no published recipe has the drink’s name, or tracking is off): {plan.unlinked.join(', ')}. </>}
        {plan.unpublished.length > 0 && <>Linked to a recipe that is no longer published: {plan.unpublished.join(', ')}. </>}
        Those drinks are not counted below.
      </div>}
      <div className={posStyles.stats}>
        <div><span>Planned drinks</span><strong>{plan.drinks}</strong></div>
        <div><span>Short on</span><strong>{plan.short.length}</strong></div>
        <div><span>Ingredient cost</span><strong>{fmtMoney(plan.cost)}</strong></div>
        <div><span>Per drink</span><strong>{plan.drinks > 0 ? fmtMoney(plan.cost / plan.drinks) : '—'}</strong></div>
      </div>
      {plan.rows.length ? <div className={styles.tableWrap}><table className={`${styles.table} ${styles.stack}`}>
        <thead><tr><th>Item</th><th className={styles.r}>Needed</th><th className={styles.r}>Estimated on hand</th><th>Stock</th><th>Buy</th></tr></thead>
        <tbody>{plan.rows.map(row => <tr key={row.item} className={row.known && !row.enough ? styles.short : undefined}>
          <td>{row.item}</td>
          <td data-label="Needed" className={styles.r}><strong>{fmtQty(row.needed)}</strong> {row.unit}</td>
          <td data-label="Estimated on hand" className={styles.r}>{row.onHand === null ? '—' : fmtQty(row.onHand)}</td>
          <td data-label="Stock"><NeedPill {...row} /></td>
          <td data-label="Buy">{!row.known ? 'Add to inventory' : row.enough ? '' : row.buyBags ? `${row.buyBags} × ${row.buyLabel}` : `${fmtQty(row.short)} ${row.unit}`}</td>
        </tr>)}</tbody>
      </table></div> : <p className={posStyles.empty}>Link drinks to recipes and enter planned servings to see what this event needs.</p>}
      <p className={posStyles.muted}>Estimated on hand already subtracts drinks logged since each item’s last count, including this event’s orders so far.</p>
    </section>

    <section className={posStyles.section} aria-labelledby="usage-heading">
      <h2 id="usage-heading">Recorded usage</h2>
      <p className={posStyles.muted}>What this event’s valid POS orders used, applying each order’s actual temperature, milk, syrup and ice choices to the linked recipe’s published version. Voided entries are excluded and corrections replace their originals.</p>
      <div className={posStyles.stats}>
        <div><span>Drinks logged</span><strong>{totalLogged}</strong></div>
        <div><span>Counted against stock</span><strong>{usage.drinksCounted}</strong></div>
        <div><span>Without a published recipe</span><strong>{usage.drinksUnlinked + usage.drinksUnpublished}</strong></div>
        <div><span>Ingredient cost</span><strong>{fmtMoney(used.reduce((sum, row) => sum + row.cost, 0))}</strong></div>
      </div>
      {used.length ? <div className={styles.tableWrap}><table className={`${styles.table} ${styles.stack}`}>
        <thead><tr><th>Item</th><th className={styles.r}>Used</th><th className={styles.r}>Cost</th></tr></thead>
        <tbody>{used.map(row => <tr key={row.item}><td>{row.item}{!row.known && <span className={styles.sub}>Not in inventory</span>}</td><td data-label="Used" className={styles.r}><strong>{fmtQty(row.needed)}</strong> {row.unit}</td><td data-label="Cost" className={styles.r}>{fmtMoney(row.cost)}</td></tr>)}</tbody>
      </table></div> : <p className={posStyles.empty}>{totalLogged ? 'None of the logged drinks has a published recipe yet.' : 'No orders logged for this event yet.'}</p>}
    </section>
  </>;
}
