import { and, asc, desc, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from './index';
import { inventoryEquipment, inventoryItemPackages, inventoryItems, inventoryMenuLinks, inventoryRecipes, posDrinkLogs, posEvents, posMenuItems, type InventoryItem, type InventoryItemPackage, type InventoryRecipe } from './schema';
import {
  InventoryError, countedQuantity, drinkWarnings, readBundle, recipeRefs, resolveDrinkRecipes, slugify, stockMap, usageFromLogs, workingBody,
  type LinkRow, type UsageLog,
} from '../inventory';
import type { PosActor } from '../pos';
import {
  countItemSchema, createRecipeSchema, deleteByIdSchema, itemFieldsSchema, menuLinkSchema, packageKey, recipeBodySchema, recipeTransitionSchema, saveDraftSchema, saveEquipmentSchema, saveItemSchema,
  type ItemFields, type RecipeBody,
} from '../validations/inventory';
import { configurationSchema } from '../validations/pos';

// Inventory is an admin tool, like POS. Every exported function checks again.
function admin(actor: PosActor) {
  if (!actor.isAdmin) throw new InventoryError('Administrator access is required.');
}
const uuid = (value: unknown) => z.uuid().parse(value);
const readOnly = { isolationLevel: 'repeatable read', accessMode: 'read only' } as const;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function uniqueConstraint(error: unknown) {
  for (let e: unknown = error; e && typeof e === 'object'; e = (e as { cause?: unknown }).cause) {
    const value = e as { code?: string; constraint_name?: string };
    if (value.code === '23505') return value.constraint_name ?? 'unknown';
  }
  return null;
}
/** Turn a unique-constraint race into a readable error. `messages` maps constraint names to text. */
async function unique<T>(work: Promise<T>, messages: Record<string, string>, fallback: string) {
  try { return await work; } catch (error) { const name = uniqueConstraint(error); if (name) throw new InventoryError(messages[name] ?? fallback); throw error; }
}
const itemUniqueMessages = { inventory_item_name: 'Another item already has that name.', inventory_package_option: 'Two purchase options have the same supplier and bag size.', inventory_package_preferred: 'Only one purchase option can be preferred.' };

// ----------------------------------------------------------------- reads

/**
 * Valid logs recorded after the earliest item count, aggregated in SQL. Rows are grouped by drink, configuration and
 * the count interval they fall in (the latest `counted_at` before them). Every log in a group is on the same side of
 * every item's count, so the group's earliest time is an exact stand-in for `usageFromLogs`, and the result grows with
 * counts × drinks × configurations rather than with every drink ever logged.
 */
async function usageGroups(tx: Tx): Promise<UsageLog[]> {
  const rows = await tx.execute(sql`
    select ${posDrinkLogs.menuItemId} as "menuItemId", ${posDrinkLogs.configuration} as "configuration",
      sum(${posDrinkLogs.quantity})::int as "quantity", min(${posDrinkLogs.recordedAt}) as "recordedAt"
    from ${posDrinkLogs}
    cross join lateral (select max(${inventoryItems.countedAt}) as after_count from ${inventoryItems} where ${inventoryItems.countedAt} < ${posDrinkLogs.recordedAt}) as count_window
    where ${posDrinkLogs.voidedAt} is null and count_window.after_count is not null
    group by ${posDrinkLogs.menuItemId}, ${posDrinkLogs.configuration}, count_window.after_count`);
  return rows.map(row => usageGroupSchema.parse(row));
}
const usageGroupSchema = z.object({ menuItemId: z.uuid(), configuration: configurationSchema, quantity: z.number().int().positive(), recordedAt: z.coerce.date() });

/** Recipe overrides for these POS drinks, keyed by menu item. Drinks without a row follow their name. */
async function linkRows(tx: Tx, menuItemIds: string[]) {
  if (!menuItemIds.length) return new Map<string, LinkRow>();
  const rows = await tx.select({ menuItemId: inventoryMenuLinks.menuItemId, recipeId: inventoryMenuLinks.recipeId, track: inventoryMenuLinks.track }).from(inventoryMenuLinks).where(inArray(inventoryMenuLinks.menuItemId, menuItemIds));
  return new Map(rows.map(row => [row.menuItemId, row]));
}

function withPackages<T extends InventoryItem>(items: T[], packages: InventoryItemPackage[]) {
  const byItem = new Map<string, InventoryItemPackage[]>();
  for (const option of packages) byItem.set(option.itemId, [...(byItem.get(option.itemId) ?? []), option]);
  return items.map(item => ({ ...item, packages: byItem.get(item.id) ?? [] }));
}
async function itemsWithPackages(tx: Tx) {
  const items = await tx.select().from(inventoryItems).orderBy(asc(inventoryItems.category), asc(inventoryItems.name));
  // A stable, readable order: options added together share a creation time, so sort by what people recognise.
  const packages = await tx.select().from(inventoryItemPackages).orderBy(asc(inventoryItemPackages.supplier), asc(inventoryItemPackages.bagSize), asc(inventoryItemPackages.id));
  return withPackages(items, packages);
}

/** Items with their counted quantity, POS usage since that count, and what is on hand now. */
async function stockWithUsage(tx: Tx) {
  const items = await itemsWithPackages(tx);
  const recipes = await tx.select().from(inventoryRecipes);
  const refs = recipeRefs(recipes);
  const groups = await usageGroups(tx);
  const drinkIds = [...new Set(groups.map(group => group.menuItemId))];
  const drinks = drinkIds.length ? await tx.select({ id: posMenuItems.id, name: posMenuItems.name }).from(posMenuItems).where(inArray(posMenuItems.id, drinkIds)) : [];
  const { links } = resolveDrinkRecipes(drinks, await linkRows(tx, drinkIds), refs);
  const usage = usageFromLogs(groups, links, refs, new Map(items.map(item => [item.name, item.countedAt])));
  return {
    recipes, refs,
    items: items.map(item => {
      const counted = countedQuantity(item); const usedSinceCount = usage.byItem.get(item.name) ?? 0;
      return { ...item, counted, usedSinceCount, onHand: counted - usedSinceCount };
    }),
  };
}
export type StockRow = Awaited<ReturnType<typeof stockWithUsage>>['items'][number];

/** Drinks on these POS events' menus that stock can make 20 or fewer more of. Removed and unavailable drinks are skipped. */
async function warningsFor(tx: Tx, eventIds: string[], stock: Awaited<ReturnType<typeof stockWithUsage>>) {
  if (!eventIds.length) return [];
  const menu = await tx.select({ id: posMenuItems.id, eventId: posMenuItems.eventId, name: posMenuItems.name, options: posMenuItems.options })
    .from(posMenuItems).where(and(inArray(posMenuItems.eventId, eventIds), isNull(posMenuItems.archivedAt), eq(posMenuItems.available, true)));
  const { links } = resolveDrinkRecipes(menu, await linkRows(tx, menu.map(drink => drink.id)), stock.refs);
  const eventOf = new Map(menu.map(drink => [drink.id, drink.eventId]));
  return drinkWarnings(menu, links, stock.refs, stockMap(stock.items)).map(warning => ({ ...warning, eventId: eventOf.get(warning.menuItemId)! }));
}

export async function getInventoryStock(actor: PosActor) {
  admin(actor);
  return db.transaction(async tx => {
    const stock = await stockWithUsage(tx);
    // Warn for every event that has not ended yet, so a shortage shows before service as well as during it.
    const live = await tx.select({ id: posEvents.id, name: posEvents.name }).from(posEvents).where(sql`${posEvents.endsAt} > now()`).orderBy(asc(posEvents.startsAt));
    const names = new Map(live.map(event => [event.id, event.name]));
    const warnings = (await warningsFor(tx, live.map(event => event.id), stock)).map(warning => ({ ...warning, eventName: names.get(warning.eventId) ?? '' }));
    return { items: stock.items, warnings };
  }, readOnly);
}
/** Drink warnings for one POS event, for the kiosk. */
export async function getDrinkWarnings(actor: PosActor, eventId: string) {
  admin(actor); const id = uuid(eventId);
  return db.transaction(async tx => warningsFor(tx, [id], await stockWithUsage(tx)), readOnly);
}
export async function listRecipes(actor: PosActor) {
  admin(actor);
  return db.select().from(inventoryRecipes).orderBy(asc(inventoryRecipes.slug));
}
export async function getRecipeWithStock(actor: PosActor, recipeId: string) {
  admin(actor); const id = uuid(recipeId);
  return db.transaction(async tx => {
    const [recipe] = await tx.select().from(inventoryRecipes).where(eq(inventoryRecipes.id, id));
    if (!recipe) return null;
    const { items } = await stockWithUsage(tx);
    const linked = await tx.select({ menuItemId: posMenuItems.id, eventId: posEvents.id, eventName: posEvents.name, startsAt: posEvents.startsAt, drinkName: posMenuItems.name })
      .from(inventoryMenuLinks).innerJoin(posMenuItems, eq(posMenuItems.id, inventoryMenuLinks.menuItemId)).innerJoin(posEvents, eq(posEvents.id, inventoryMenuLinks.eventId))
      .where(and(eq(inventoryMenuLinks.recipeId, id), eq(inventoryMenuLinks.track, true))).orderBy(desc(posEvents.startsAt));
    return { recipe, items, linked };
  }, readOnly);
}
export async function listEquipment(actor: PosActor) {
  admin(actor);
  return db.select().from(inventoryEquipment).orderBy(asc(inventoryEquipment.category), asc(inventoryEquipment.name));
}

/** POS events with how many drinks still on each menu have a recipe, and how many servings are planned. */
export async function listInventoryEvents(actor: PosActor) {
  admin(actor);
  return db.transaction(async tx => {
    const events = await tx.select({ id: posEvents.id, name: posEvents.name, startsAt: posEvents.startsAt, endsAt: posEvents.endsAt }).from(posEvents).orderBy(desc(posEvents.startsAt));
    const menu = await tx.select({ id: posMenuItems.id, eventId: posMenuItems.eventId, name: posMenuItems.name, planned: inventoryMenuLinks.plannedServings })
      .from(posMenuItems).leftJoin(inventoryMenuLinks, eq(inventoryMenuLinks.menuItemId, posMenuItems.id)).where(isNull(posMenuItems.archivedAt));
    const { links } = resolveDrinkRecipes(menu, await linkRows(tx, menu.map(drink => drink.id)), recipeRefs(await tx.select().from(inventoryRecipes)));
    return events.map(event => {
      const drinks = menu.filter(drink => drink.eventId === event.id);
      return { ...event, drinks: drinks.length, linked: drinks.filter(drink => links.get(drink.id)).length, planned: drinks.reduce((sum, drink) => sum + (drink.planned ?? 0), 0) };
    });
  }, readOnly);
}

/**
 * Everything the event inventory page needs, read in one snapshot: the POS menu with each drink's recipe and plan,
 * current stock, the event's valid drink logs for actual usage, and drinks running low.
 */
export async function getEventInventory(actor: PosActor, eventId: string) {
  admin(actor); const id = uuid(eventId);
  return db.transaction(async tx => {
    const [event] = await tx.select().from(posEvents).where(eq(posEvents.id, id));
    if (!event) return null;
    const menu = await tx.select({ id: posMenuItems.id, name: posMenuItems.name, options: posMenuItems.options, available: posMenuItems.available, archivedAt: posMenuItems.archivedAt, sortOrder: posMenuItems.sortOrder, recipeId: inventoryMenuLinks.recipeId, track: inventoryMenuLinks.track, plannedServings: inventoryMenuLinks.plannedServings })
      .from(posMenuItems).leftJoin(inventoryMenuLinks, eq(inventoryMenuLinks.menuItemId, posMenuItems.id)).where(eq(posMenuItems.eventId, id)).orderBy(asc(posMenuItems.sortOrder), asc(posMenuItems.name));
    const stock = await stockWithUsage(tx);
    const logs = (await tx.select({ menuItemId: posDrinkLogs.menuItemId, configuration: posDrinkLogs.configuration, quantity: posDrinkLogs.quantity, recordedAt: posDrinkLogs.recordedAt })
      .from(posDrinkLogs).where(and(eq(posDrinkLogs.eventId, id), isNull(posDrinkLogs.voidedAt)))).map(row => ({ ...row, configuration: configurationSchema.parse(row.configuration) }));
    const loggedBy = new Map<string, number>();
    for (const log of logs) loggedBy.set(log.menuItemId, (loggedBy.get(log.menuItemId) ?? 0) + log.quantity);
    const rows = new Map(menu.filter(drink => drink.track !== null).map(drink => [drink.id, { menuItemId: drink.id, recipeId: drink.recipeId, track: drink.track! }]));
    const { links, source } = resolveDrinkRecipes(menu, rows, stock.refs);
    return {
      event, items: stock.items, recipes: stock.recipes, refs: stock.refs, logs, links,
      warnings: await warningsFor(tx, [id], stock),
      // Removed drinks stay listed only while they have valid orders, so their usage can still be attributed.
      menu: menu.filter(drink => !drink.archivedAt || loggedBy.has(drink.id)).map(drink => ({
        ...drink, plannedServings: drink.plannedServings ?? 0, logged: loggedBy.get(drink.id) ?? 0,
        source: source.get(drink.id)!, recipeInUse: links.get(drink.id) ?? null,
      })),
    };
  }, readOnly);
}

export async function getExportData(actor: PosActor) {
  admin(actor);
  return db.transaction(async tx => ({
    items: await itemsWithPackages(tx),
    equipment: await tx.select().from(inventoryEquipment).orderBy(asc(inventoryEquipment.category), asc(inventoryEquipment.name)),
    recipes: await tx.select().from(inventoryRecipes).orderBy(asc(inventoryRecipes.slug)),
  }), readOnly);
}

// ------------------------------------------------------------- inventory

function itemValues(value: ItemFields) {
  const { name, category, unit, openAmount, par, notes } = value;
  return { name, category, unit, openAmount, par, notes };
}
function optionValues({ supplier, bagSize, costPerBag, sealedBags, preferred }: ItemFields['packages'][number]) {
  return { supplier, bagSize, costPerBag, sealedBags, preferred };
}
async function packagesOf(tx: Tx, itemId: string) {
  return tx.select().from(inventoryItemPackages).where(eq(inventoryItemPackages.itemId, itemId)).for('update');
}
/** Make an item's purchase options exactly `next`: update those with an id, add the rest, remove what is missing. */
async function replacePackages(tx: Tx, itemId: string, next: ItemFields['packages']) {
  const current = await packagesOf(tx, itemId);
  const known = new Set(current.map(option => option.id));
  const foreign = next.find(option => option.id && !known.has(option.id));
  if (foreign) throw new InventoryError('A purchase option changed. Refresh before saving again.');
  const keep = next.flatMap(option => option.id ? [option.id] : []);
  await tx.delete(inventoryItemPackages).where(and(eq(inventoryItemPackages.itemId, itemId), keep.length ? notInArray(inventoryItemPackages.id, keep) : undefined));
  // Clear `preferred` first so moving it between options never trips the one-preferred index mid-update.
  await tx.update(inventoryItemPackages).set({ preferred: false }).where(eq(inventoryItemPackages.itemId, itemId));
  for (const option of next) {
    if (option.id) await tx.update(inventoryItemPackages).set(optionValues(option)).where(eq(inventoryItemPackages.id, option.id));
    else await tx.insert(inventoryItemPackages).values({ ...optionValues(option), itemId });
  }
}

/** Recipes refer to items by name, so a rename rewrites those references in the same transaction. */
async function renameInRecipes(tx: Tx, from: string, to: string, actorId: string) {
  const recipes = await tx.select().from(inventoryRecipes).for('update');
  const rename = (body: RecipeBody | null) => body && body.ingredients.some(i => i.item === from) ? { ...body, ingredients: body.ingredients.map(i => i.item === from ? { ...i, item: to } : i) } : body;
  for (const recipe of recipes) {
    const published = rename(recipe.published); const draft = rename(recipe.draft);
    if (published === recipe.published && draft === recipe.draft) continue;
    await tx.update(inventoryRecipes).set({ published, draft, version: recipe.version + 1, updatedAt: new Date(), updatedBy: actorId }).where(eq(inventoryRecipes.id, recipe.id));
  }
}

export async function saveInventoryItem(actor: PosActor, input: unknown) {
  admin(actor); const value = saveItemSchema.parse(input);
  return unique(db.transaction(async tx => {
    if (!value.id) {
      const [created] = await tx.insert(inventoryItems).values({ ...itemValues(value), updatedBy: actor.id }).returning();
      if (value.packages.length) await tx.insert(inventoryItemPackages).values(value.packages.map(option => ({ ...optionValues(option), itemId: created.id })));
      return created;
    }
    if (!value.expectedVersion) throw new InventoryError('Refresh the inventory before editing.');
    const [current] = await tx.select().from(inventoryItems).where(eq(inventoryItems.id, value.id)).for('update');
    if (!current) throw new InventoryError('That item is no longer in the inventory.');
    if (current.version !== value.expectedVersion) throw new InventoryError('This item changed. Refresh before saving again.');
    const before = countedQuantity({ openAmount: current.openAmount, packages: await packagesOf(tx, current.id) });
    if (current.name !== value.name) await renameInRecipes(tx, current.name, value.name, actor.id);
    await replacePackages(tx, current.id, value.packages);
    const [item] = await tx.update(inventoryItems).set({
      ...itemValues(value), version: current.version + 1, updatedAt: new Date(), updatedBy: actor.id,
      // A changed total is a new count; editing a supplier name or price is not.
      ...(countedQuantity(value) !== before ? { countedAt: new Date() } : {}),
    }).where(eq(inventoryItems.id, current.id)).returning();
    return item;
  }), itemUniqueMessages, 'Another item already has that name.');
}

/** Record a physical count. This always resets the count time, even when the numbers match, because it was counted. */
export async function countInventoryItem(actor: PosActor, input: unknown) {
  admin(actor); const value = countItemSchema.parse(input);
  return db.transaction(async tx => {
    const [item] = await tx.update(inventoryItems).set({ openAmount: value.openAmount, countedAt: new Date(), version: value.expectedVersion + 1, updatedAt: new Date(), updatedBy: actor.id })
      .where(and(eq(inventoryItems.id, value.id), eq(inventoryItems.version, value.expectedVersion))).returning();
    if (!item) throw new InventoryError('This item changed. Refresh before recording the count.');
    const known = new Set((await packagesOf(tx, item.id)).map(option => option.id));
    for (const option of value.packages) {
      if (!known.has(option.id)) throw new InventoryError('A purchase option changed. Refresh before recording the count.');
      await tx.update(inventoryItemPackages).set({ sealedBags: option.sealedBags }).where(eq(inventoryItemPackages.id, option.id));
    }
    return item;
  });
}

export async function deleteInventoryItem(actor: PosActor, input: unknown) {
  admin(actor); const { id } = deleteByIdSchema.parse(input);
  await db.delete(inventoryItems).where(eq(inventoryItems.id, id));
  return id;
}

/**
 * Merge items by name and their purchase options by supplier and bag size: a match updates it, anything new is added,
 * and nothing is ever deleted. Existing preferred choices are kept.
 */
async function mergeItems(tx: Tx, actor: PosActor, rows: ItemFields[]) {
  const existing = rows.length ? await tx.select().from(inventoryItems).where(inArray(inventoryItems.name, rows.map(row => row.name))).for('update') : [];
  const byName = new Map(existing.map(item => [item.name, item]));
  let added = 0, updated = 0;
  for (const row of rows) {
    const current = byName.get(row.name);
    if (!current) {
      const [created] = await tx.insert(inventoryItems).values({ ...itemValues(row), updatedBy: actor.id }).returning();
      if (row.packages.length) await tx.insert(inventoryItemPackages).values(row.packages.map(option => ({ ...optionValues(option), itemId: created.id })));
      added++; continue;
    }
    const options = await packagesOf(tx, current.id);
    const before = countedQuantity({ openAmount: current.openAmount, packages: options });
    const byKey = new Map(options.map(option => [packageKey(option.supplier, option.bagSize), option]));
    for (const option of row.packages) {
      const match = byKey.get(packageKey(option.supplier, option.bagSize));
      if (match) await tx.update(inventoryItemPackages).set({ costPerBag: option.costPerBag, sealedBags: option.sealedBags }).where(eq(inventoryItemPackages.id, match.id));
      else await tx.insert(inventoryItemPackages).values({ ...optionValues(option), preferred: option.preferred && !options.some(o => o.preferred), itemId: current.id });
    }
    const after = countedQuantity({ openAmount: row.openAmount, packages: await packagesOf(tx, current.id) });
    await tx.update(inventoryItems).set({ ...itemValues(row), version: current.version + 1, updatedAt: new Date(), updatedBy: actor.id, ...(after !== before ? { countedAt: new Date() } : {}) }).where(eq(inventoryItems.id, current.id));
    updated++;
  }
  return { added, updated };
}
export async function importInventoryItems(actor: PosActor, rows: ItemFields[]) {
  admin(actor); const items = rows.map(row => itemFieldsSchema.parse(row));
  return unique(db.transaction(tx => mergeItems(tx, actor, items)), itemUniqueMessages, 'Two rows resolve to the same item. Refresh and try again.');
}

// ------------------------------------------------------------- equipment

export async function saveEquipment(actor: PosActor, input: unknown) {
  admin(actor); const { id, expectedVersion, ...fields } = saveEquipmentSchema.parse(input);
  return unique((async () => {
    if (!id) { const [created] = await db.insert(inventoryEquipment).values({ ...fields, updatedBy: actor.id }).returning(); return created; }
    if (!expectedVersion) throw new InventoryError('Refresh the equipment register before editing.');
    const [item] = await db.update(inventoryEquipment).set({ ...fields, version: expectedVersion + 1, updatedAt: new Date(), updatedBy: actor.id })
      .where(and(eq(inventoryEquipment.id, id), eq(inventoryEquipment.version, expectedVersion))).returning();
    if (!item) throw new InventoryError('This equipment changed. Refresh before saving again.');
    return item;
  })(), {}, 'Other equipment already has that name.');
}
export async function deleteEquipment(actor: PosActor, input: unknown) {
  admin(actor); const { id } = deleteByIdSchema.parse(input);
  await db.delete(inventoryEquipment).where(eq(inventoryEquipment.id, id));
  return id;
}

// --------------------------------------------------------------- recipes
// Two bodies per recipe: `published` is what POS drinks pour, `draft` collects edits. Only publishing changes usage.

async function freeSlug(tx: Tx, name: string) {
  const base = slugify(name);
  const taken = new Set((await tx.select({ slug: inventoryRecipes.slug }).from(inventoryRecipes).where(sql`${inventoryRecipes.slug} = ${base} OR ${inventoryRecipes.slug} LIKE ${base + '-%'}`)).map(row => row.slug));
  for (let n = 1; ; n++) { const slug = n === 1 ? base : `${base}-${n}`; if (!taken.has(slug)) return slug; }
}
export async function createRecipe(actor: PosActor, input: unknown) {
  admin(actor); const { name } = createRecipeSchema.parse(input);
  return unique(db.transaction(async tx => {
    const [recipe] = await tx.insert(inventoryRecipes).values({ slug: await freeSlug(tx, name), draft: { name, category: 'Espresso', ingredients: [], steps: [], notes: '' }, updatedBy: actor.id }).returning();
    return recipe;
  }), {}, 'Another recipe was created with that name at the same moment. Try again.');
}
async function transition(actor: PosActor, input: unknown, change: (recipe: InventoryRecipe) => Partial<typeof inventoryRecipes.$inferInsert>) {
  const value = recipeTransitionSchema.parse(input);
  return db.transaction(async tx => {
    const [recipe] = await tx.select().from(inventoryRecipes).where(eq(inventoryRecipes.id, value.id)).for('update');
    if (!recipe) throw new InventoryError('That recipe is no longer in the book.');
    if (recipe.version !== value.expectedVersion) throw new InventoryError('This recipe changed. Refresh before continuing.');
    const [updated] = await tx.update(inventoryRecipes).set({ ...change(recipe), version: recipe.version + 1, updatedAt: new Date(), updatedBy: actor.id }).where(eq(inventoryRecipes.id, recipe.id)).returning();
    return updated;
  });
}
export async function saveRecipeDraft(actor: PosActor, input: unknown) {
  admin(actor); const value = saveDraftSchema.parse(input);
  return transition(actor, { id: value.id, expectedVersion: value.expectedVersion }, () => ({ draft: value.body }));
}
export async function publishRecipe(actor: PosActor, input: unknown) {
  admin(actor);
  return transition(actor, input, recipe => {
    const body = recipeBodySchema.parse(workingBody(recipe));
    if (!body.name.trim()) throw new InventoryError('Give the recipe a name before publishing.');
    if (!body.ingredients.length) throw new InventoryError('Add at least one ingredient before publishing.');
    return { published: body, draft: null, publishedVersion: recipe.publishedVersion + 1, publishedAt: new Date(), publishedBy: actor.id };
  });
}
export async function discardRecipeDraft(actor: PosActor, input: unknown) {
  admin(actor);
  return transition(actor, input, recipe => {
    if (!recipe.published) throw new InventoryError('This recipe has never been published, so there is nothing to go back to. Delete it instead.');
    return { draft: null };
  });
}
/** Pull a recipe out of the book. Its content becomes a draft again, and linked POS drinks stop counting usage. */
export async function unpublishRecipe(actor: PosActor, input: unknown) {
  admin(actor);
  return transition(actor, input, recipe => ({ draft: workingBody(recipe), published: null }));
}
export async function deleteRecipe(actor: PosActor, input: unknown) {
  admin(actor); const { id } = deleteByIdSchema.parse(input);
  await db.delete(inventoryRecipes).where(eq(inventoryRecipes.id, id));
  return id;
}

// ------------------------------------------------------- POS menu links

/**
 * Choose which recipe a POS drink pours (`auto` follows its name, `none` stops tracking) and set its planned servings.
 * Never writes to POS tables.
 */
export async function saveMenuLink(actor: PosActor, input: unknown) {
  admin(actor); const value = menuLinkSchema.parse(input);
  return db.transaction(async tx => {
    // Same event-first lock order as POS writes, so a concurrent POS event deletion cannot interleave.
    const [event] = await tx.select({ id: posEvents.id }).from(posEvents).where(eq(posEvents.id, value.eventId)).for('share');
    if (!event) throw new InventoryError('Event not found.');
    const [drink] = await tx.select({ id: posMenuItems.id }).from(posMenuItems).where(and(eq(posMenuItems.eventId, value.eventId), eq(posMenuItems.id, value.menuItemId)));
    if (!drink) throw new InventoryError('That drink is not on this event’s menu.');
    const pinned = value.recipe !== 'auto' && value.recipe !== 'none' ? value.recipe : null;
    if (pinned) {
      const [recipe] = await tx.select({ published: inventoryRecipes.published }).from(inventoryRecipes).where(eq(inventoryRecipes.id, pinned));
      if (!recipe) throw new InventoryError('That recipe is no longer in the book.');
      if (!recipe.published) throw new InventoryError('Only published recipes can be linked to a POS drink.');
    }
    const values = { recipeId: pinned, track: value.recipe !== 'none', plannedServings: value.plannedServings, updatedAt: new Date(), updatedBy: actor.id };
    const [link] = await tx.insert(inventoryMenuLinks).values({ menuItemId: value.menuItemId, eventId: value.eventId, ...values })
      .onConflictDoUpdate({ target: inventoryMenuLinks.menuItemId, set: values }).returning();
    return link;
  });
}

// ---------------------------------------------------------------- bundle

export async function importBundle(actor: PosActor, parsed: unknown) {
  admin(actor);
  const read = readBundle(parsed);
  if (!read.ok) throw new InventoryError(read.error);
  if (!read.inventory.length && !read.equipment.length && !read.recipes.length) throw new InventoryError(`Nothing importable in that file.${read.skipped.length ? ` ${read.skipped.length} row(s) were not usable.` : ''}`);
  const result = await unique(db.transaction(async tx => {
    const items = await mergeItems(tx, actor, read.inventory);

    let equipmentAdded = 0, equipmentUpdated = 0;
    const currentEquipment = new Map((await tx.select().from(inventoryEquipment).for('update')).map(row => [row.name, row]));
    for (const row of read.equipment) {
      const current = currentEquipment.get(row.name);
      if (current) { await tx.update(inventoryEquipment).set({ ...row, version: current.version + 1, updatedAt: new Date(), updatedBy: actor.id }).where(eq(inventoryEquipment.id, current.id)); equipmentUpdated++; }
      else { await tx.insert(inventoryEquipment).values({ ...row, updatedBy: actor.id }); equipmentAdded++; }
    }

    let recipesAdded = 0, recipesUpdated = 0;
    const currentRecipes = new Map((await tx.select().from(inventoryRecipes).for('update')).map(row => [row.slug, row]));
    for (const row of read.recipes) {
      const current = currentRecipes.get(row.slug);
      // A published row lands in the published slot and a draft row in the draft slot, so the split survives a round trip.
      const slots = row.status === 'published'
        ? { published: row.body, draft: null, publishedVersion: (current?.publishedVersion ?? 0) + 1, publishedAt: new Date(), publishedBy: actor.id }
        : { draft: row.body };
      if (current) { await tx.update(inventoryRecipes).set({ ...slots, version: current.version + 1, updatedAt: new Date(), updatedBy: actor.id }).where(eq(inventoryRecipes.id, current.id)); recipesUpdated++; }
      else { await tx.insert(inventoryRecipes).values({ slug: row.slug, ...slots, updatedBy: actor.id }); recipesAdded++; }
    }
    return { itemsAdded: items.added, itemsUpdated: items.updated, equipmentAdded, equipmentUpdated, recipesAdded, recipesUpdated };
  }), itemUniqueMessages, 'A record changed name during the import. Try again.');
  return { ...result, skipped: read.skipped, guidelinesIgnored: read.guidelines };
}
