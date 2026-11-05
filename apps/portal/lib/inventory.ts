// Inventory domain rules. Pure functions only: no database and no React, so they can be tested directly.
// Ported from the prototype's schema.js (LatteLab/inventory-system-draft) and extended so recipes respond to
// POS drink configurations. See docs/specs/2026-11-05-inventory/design.md.
import { z } from 'zod';
import type { Configuration, MenuOptions } from './validations/pos';
import {
  BUNDLE_FORMAT, BUNDLE_VERSION, bundleEnvelopeSchema, bundleEquipmentSchema, bundleItemSchema, bundleRecipeSchema,
  equipmentStatuses, itemCategories, itemFieldsSchema, packageKey, units,
  type EquipmentFields, type Ingredient, type ItemFields, type PackageFields, type RecipeBody,
} from './validations/inventory';

export class InventoryError extends Error {}

export const conditionLabels: Record<Ingredient['when'], string> = {
  always: 'Every drink', hot: 'Hot only', iced: 'Iced only', whole: 'Whole milk only', oat: 'Oat milk only',
};
export const scaleLabels: Record<Ingredient['scale'], string> = {
  fixed: 'Fixed amount', syrup: 'Scales with syrup %', ice: 'Scales with ice level',
};
export const equipmentStatusMeta: Record<(typeof equipmentStatuses)[number], { label: string; usable: boolean; tone: 'ok' | 'warn' | 'bad' | 'quiet' }> = {
  ok: { label: 'Ready', usable: true, tone: 'ok' },
  repair: { label: 'Needs repair', usable: false, tone: 'bad' },
  loaned: { label: 'On loan', usable: false, tone: 'warn' },
  missing: { label: 'Missing', usable: false, tone: 'bad' },
  retired: { label: 'Retired', usable: false, tone: 'quiet' },
};
/** Ice level as a share of the recipe's full-ice amount. */
export const ICE_FACTOR: Record<'None' | 'Light' | 'Full', number> = { None: 0, Light: 0.5, Full: 1 };

const finite = (value: unknown) => { const n = typeof value === 'number' ? value : Number.parseFloat(String(value ?? '')); return Number.isFinite(n) ? n : 0; };
export function round(value: number, places = 3) { const p = 10 ** places; return Math.round(finite(value) * p) / p; }
export function fmtQty(value: number) { return round(value, 2).toLocaleString('en-US', { maximumFractionDigits: 2 }); }
export function fmtMoney(value: number) { return '$' + finite(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

// ----------------------------------------------------------------- stock
// An item is one ingredient (what recipes name). Its purchase options are the ways we buy it: supplier, bag size,
// cost per bag and how many sealed bags of that option are on hand. Counts and usage are per ingredient.

export type PackageLike = Pick<PackageFields, 'supplier' | 'bagSize' | 'costPerBag' | 'sealedBags' | 'preferred'>;
export type StockFields = { openAmount: number; packages: Pick<PackageLike, 'bagSize' | 'sealedBags'>[] };
/** Units physically counted: every purchase option's sealed bags plus the open amount. Never stored. */
export function countedQuantity(item: StockFields) {
  return round(item.packages.reduce((sum, option) => sum + option.bagSize * option.sealedBags, 0) + item.openAmount);
}
const perUnit = (option: Pick<PackageLike, 'costPerBag' | 'bagSize'>) => option.costPerBag / option.bagSize;
/** The option to buy more of: the one marked preferred, otherwise the cheapest per unit. */
export function reorderOption<T extends PackageLike>(packages: T[]): T | null {
  return packages.find(option => option.preferred) ?? [...packages].sort((a, b) => perUnit(a) - perUnit(b))[0] ?? null;
}
/**
 * Dollars per unit, derived from cost per bag. Weighted by the sealed stock on hand, so mixing suppliers or sizes
 * averages correctly; with no sealed stock it falls back to the option you would buy next.
 */
export function unitCost(packages: PackageLike[]) {
  const sealedUnits = packages.reduce((sum, option) => sum + option.bagSize * option.sealedBags, 0);
  if (sealedUnits > 0) return packages.reduce((sum, option) => sum + option.costPerBag * option.sealedBags, 0) / sealedUnits;
  const next = reorderOption(packages);
  return next ? perUnit(next) : 0;
}
export function packageLabel(option: Pick<PackageLike, 'supplier' | 'bagSize'>, unit: string) {
  return `${option.supplier || 'Any supplier'} · ${fmtQty(option.bagSize)} ${unit}`;
}
/** `out` at or below zero, `low` at or below par, otherwise `ok`. A par of zero never flags low. */
export function stockStatus(quantity: number, par: number): 'out' | 'low' | 'ok' {
  if (quantity <= 0) return 'out';
  if (par > 0 && quantity <= par) return 'low';
  return 'ok';
}

// --------------------------------------------------------------- recipes

export type RecipeState = 'unpublished' | 'changed' | 'published';
export type RecipeDoc = { published: RecipeBody | null; draft: RecipeBody | null };
export function emptyBody(name = ''): RecipeBody { return { name, category: 'Espresso', ingredients: [], steps: [], notes: '' }; }
/** What an editor sees: the draft when there is one, otherwise the published body. */
export function workingBody(recipe: RecipeDoc): RecipeBody { return recipe.draft ?? recipe.published ?? emptyBody(); }
export function recipeState(recipe: RecipeDoc): RecipeState { return !recipe.published ? 'unpublished' : recipe.draft ? 'changed' : 'published'; }
export function recipeName(recipe: RecipeDoc) { return workingBody(recipe).name || 'Untitled recipe'; }

/**
 * How a POS drink name is compared with recipe names: case, accents, spacing and punctuation are ignored, and any
 * script counts ("Café Latte" = "cafe latte", "抹茶ラテ" stays distinct from "ほうじ茶ラテ"). Empty means "no name".
 */
export function nameKey(name: string) {
  return String(name || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

export function slugify(name: string) {
  return String(name || '').toLowerCase().replace(/—|–/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'recipe';
}

/** Whether one recipe line is used by a drink with this configuration. */
export function ingredientApplies(ingredient: Pick<Ingredient, 'when'>, configuration: Configuration) {
  switch (ingredient.when) {
    case 'hot': return configuration.temperature === 'Hot';
    case 'iced': return configuration.temperature === 'Iced';
    case 'whole': return configuration.milk === 'Whole';
    case 'oat': return configuration.milk === 'Oat';
    default: return true;
  }
}
/** Units of one line used by ONE drink with this configuration. Recipe quantities are per single serving. */
export function ingredientAmount(ingredient: Pick<Ingredient, 'when' | 'scale' | 'qty'>, configuration: Configuration) {
  if (!ingredientApplies(ingredient, configuration)) return 0;
  if (ingredient.scale === 'syrup') return ingredient.qty * configuration.syrup / 100;
  if (ingredient.scale === 'ice') return configuration.temperature === 'Iced' ? ingredient.qty * ICE_FACTOR[configuration.ice] : 0;
  return ingredient.qty;
}
/** Add `quantity` drinks of this recipe and configuration to a running per-item total. */
export function addDrinkUsage(totals: Map<string, number>, body: RecipeBody, configuration: Configuration, quantity: number) {
  for (const ingredient of body.ingredients) {
    const used = ingredientAmount(ingredient, configuration) * quantity;
    if (used > 0) totals.set(ingredient.item, (totals.get(ingredient.item) ?? 0) + used);
  }
  return totals;
}

// ----------------------------------------------------- POS synchronization

export type UsageLog = { menuItemId: string; configuration: Configuration; quantity: number; recordedAt: Date | string };
export type RecipeRef = { id: string; name: string; published: RecipeBody | null };
export type DrinkLinks = Map<string, string | null>; // POS menu item id -> recipe id used for usage
export function recipeRefs(recipes: ({ id: string } & RecipeDoc)[]) {
  return new Map<string, RecipeRef>(recipes.map(recipe => [recipe.id, { id: recipe.id, name: workingBody(recipe).name, published: recipe.published }]));
}

export type LinkRow = { menuItemId: string; recipeId: string | null; track: boolean };
export type LinkSource = 'pinned' | 'auto' | 'off' | 'unmatched' | 'ambiguous';
/**
 * Which recipe each POS drink pours. A pinned recipe wins; `track = false` turns usage off; otherwise the drink uses
 * the published recipe with the same name, so a new event's menu deducts stock without any setup. Names are compared
 * with `nameKey` ("vanilla latte" matches "Vanilla Latte"); a name shared by two published recipes matches neither.
 */
export function resolveDrinkRecipes(drinks: { id: string; name: string }[], links: Map<string, LinkRow>, recipes: Map<string, RecipeRef>) {
  const byName = new Map<string, string | null>();
  for (const recipe of recipes.values()) {
    if (!recipe.published) continue;
    const key = nameKey(recipe.published.name);
    if (key) byName.set(key, byName.has(key) ? null : recipe.id);
  }
  const resolved: DrinkLinks = new Map(); const source = new Map<string, LinkSource>();
  for (const drink of drinks) {
    const link = links.get(drink.id);
    if (link && !link.track) { resolved.set(drink.id, null); source.set(drink.id, 'off'); continue; }
    if (link?.recipeId) { resolved.set(drink.id, link.recipeId); source.set(drink.id, 'pinned'); continue; }
    const key = nameKey(drink.name);
    const match = key ? byName.get(key) ?? null : null;
    resolved.set(drink.id, match); source.set(drink.id, match ? 'auto' : key && byName.has(key) ? 'ambiguous' : 'unmatched');
  }
  return { links: resolved, source };
}

function servingBody(menuItemId: string, links: DrinkLinks, recipes: Map<string, RecipeRef>) {
  const recipeId = links.get(menuItemId) ?? null;
  if (!recipeId) return { status: 'unlinked' as const, body: null };
  const recipe = recipes.get(recipeId);
  if (!recipe?.published) return { status: 'unpublished' as const, body: null };
  return { status: 'ok' as const, body: recipe.published };
}

/**
 * Ingredient use implied by valid POS drink logs. Only the published body of a drink's recipe counts, matching the
 * prototype's rule that drafts are never served. `countedAt` limits each item to drinks recorded after its last
 * count, which is how the stock view keeps on-hand current without ever writing to the count.
 */
export function usageFromLogs(logs: UsageLog[], links: DrinkLinks, recipes: Map<string, RecipeRef>, countedAt?: Map<string, Date>) {
  const byItem = new Map<string, number>();
  let counted = 0, unlinked = 0, unpublished = 0;
  for (const log of logs) {
    const serving = servingBody(log.menuItemId, links, recipes);
    if (!serving.body) { if (serving.status === 'unlinked') unlinked += log.quantity; else unpublished += log.quantity; continue; }
    counted += log.quantity;
    const at = new Date(log.recordedAt).getTime();
    for (const ingredient of serving.body.ingredients) {
      const since = countedAt?.get(ingredient.item);
      if (countedAt && (!since || at <= since.getTime())) continue;
      const used = ingredientAmount(ingredient, log.configuration) * log.quantity;
      if (used > 0) byItem.set(ingredient.item, (byItem.get(ingredient.item) ?? 0) + used);
    }
  }
  return { byItem, drinksCounted: counted, drinksUnlinked: unlinked, drinksUnpublished: unpublished };
}

export type StockLine = { name: string; unit: string; costPerUnit: number; onHand: number; reorder: { label: string; bagSize: number } | null };
type StockSource = { name: string; unit: string; onHand: number; packages: PackageLike[] };
export function stockMap(items: StockSource[]) {
  return new Map<string, StockLine>(items.map(item => {
    const next = reorderOption(item.packages);
    return [item.name, { name: item.name, unit: item.unit, onHand: item.onHand, costPerUnit: unitCost(item.packages), reorder: next ? { label: packageLabel(next, item.unit), bagSize: next.bagSize } : null }];
  }));
}
export type DemandRow = { item: string; unit: string; needed: number; onHand: number | null; known: boolean; enough: boolean; short: number; cost: number; buyBags: number; buyLabel: string };
/** Compare a per-item demand total against stock, with a shopping line in whole bags of the option to buy. */
export function demandRows(totals: Map<string, number>, stock: Map<string, StockLine>): DemandRow[] {
  return [...totals.entries()].map(([name, rawNeeded]) => {
    const item = stock.get(name) ?? null; const needed = round(rawNeeded);
    const known = item !== null; const onHand = item ? item.onHand : null;
    const enough = known && (onHand ?? 0) >= needed;
    const shortBy = known && !enough ? round(needed - Math.max(0, onHand ?? 0)) : 0;
    return {
      item: name, unit: item?.unit ?? '', needed, onHand, known, enough, short: shortBy,
      cost: item ? needed * item.costPerUnit : 0,
      buyBags: item?.reorder && shortBy > 0 ? Math.ceil(shortBy / item.reorder.bagSize) : 0,
      buyLabel: item?.reorder?.label ?? '',
    };
  }).sort((a, b) => a.item.localeCompare(b.item));
}

export type PlanDrink = { menuItemId: string; name: string; defaults: Configuration; plannedServings: number; logged?: number };
/**
 * Ingredient demand for the drinks an event still has to serve: planned servings minus those already logged, because
 * logged drinks have already come off on hand. Configuration is not known before service, so each drink is planned at
 * its menu default choices.
 */
export function eventPlan(menu: PlanDrink[], links: DrinkLinks, recipes: Map<string, RecipeRef>, stock: Map<string, StockLine>) {
  const totals = new Map<string, number>();
  const unlinked: string[] = []; const unpublished: string[] = [];
  let drinks = 0;
  for (const drink of menu) {
    const toServe = Math.max(0, drink.plannedServings - (drink.logged ?? 0));
    if (toServe <= 0) continue;
    const serving = servingBody(drink.menuItemId, links, recipes);
    if (!serving.body) { (serving.status === 'unlinked' ? unlinked : unpublished).push(drink.name); continue; }
    drinks += toServe;
    addDrinkUsage(totals, serving.body, drink.defaults, toServe);
  }
  const rows = demandRows(totals, stock);
  return { rows, drinks, unlinked, unpublished, short: rows.filter(row => row.known && !row.enough), missing: rows.filter(row => !row.known), cost: rows.reduce((sum, row) => sum + row.cost, 0) };
}

// --------------------------------------------------- drinks left warnings

/** Warn once a drink can be made this many times or fewer from current stock. */
export const DRINKS_LEFT_WARNING = 20;

/** Every configuration a POS drink allows. Hot drinks have no ice choice. */
export function configurationsFor(options: Omit<MenuOptions, 'defaults'>): Configuration[] {
  const out: Configuration[] = [];
  for (const temperature of options.temperatures) for (const milk of options.milks) for (const syrup of options.syrups) {
    if (temperature === 'Hot') out.push({ temperature, milk, syrup });
    else for (const ice of options.iceLevels) out.push({ temperature, milk, syrup, ice });
  }
  return out;
}

export type DrinkLimit = { item: string; unit: string; onHand: number; perDrink: number; drinksLeft: number };
export type CapacityGroup = { label: string; drinksLeft: number; limits: DrinkLimit[] };
export type DrinkCapacity = { drinksLeft: number | null; groups: CapacityGroup[]; missing: string[] };
const milkLabel = { Whole: 'whole milk', Oat: 'oat milk' } as const;
const temperatureLabel = { Hot: 'hot', Iced: 'iced' } as const;

/** Per-ingredient drinks left for a set of configurations, each ingredient at its largest amount among them. */
function limitsFor(body: RecipeBody, configurations: Configuration[], stock: Map<string, { unit: string; onHand: number }>) {
  const perDrink = new Map<string, number>();
  for (const configuration of configurations) {
    for (const [item, amount] of addDrinkUsage(new Map(), body, configuration, 1)) perDrink.set(item, Math.max(perDrink.get(item) ?? 0, amount));
  }
  const limits: DrinkLimit[] = []; const missing: string[] = [];
  for (const [item, amount] of perDrink) {
    const line = stock.get(item);
    if (!line) { missing.push(item); continue; }
    limits.push({ item, unit: line.unit, onHand: line.onHand, perDrink: amount, drinksLeft: Math.floor(round(Math.max(0, line.onHand) / amount, 6)) });
  }
  return { limits: limits.sort((a, b) => a.drinksLeft - b.drinksLeft || a.item.localeCompare(b.item)), missing };
}

/**
 * How many more of one drink current stock makes, by drink type. Types are temperature × milk; within a type each
 * ingredient is taken at its largest amount (100% syrup, full ice), so figures are cautious. Types with the same
 * answer are merged, so a drink limited only by milk reads "9 with oat milk · 15 with whole milk". Each drink is
 * assessed as if it had the stock to itself; ingredients shared between drinks run down for all of them at once.
 */
export function drinkCapacity(body: RecipeBody, options: Omit<MenuOptions, 'defaults'>, stock: Map<string, { unit: string; onHand: number }>): DrinkCapacity {
  const all = configurationsFor(options);
  const types = options.temperatures.flatMap(temperature => options.milks.map(milk => ({ temperature, milk })));
  const counts = types.map(type => ({ ...type, ...limitsFor(body, all.filter(c => c.temperature === type.temperature && c.milk === type.milk), stock) }))
    .map(type => ({ ...type, drinksLeft: type.limits[0]?.drinksLeft ?? null }));
  const missing = limitsFor(body, all, stock).missing;
  if (counts.every(type => type.drinksLeft === null)) return { drinksLeft: null, groups: [], missing };
  const same = (key: (t: (typeof counts)[number]) => string) => counts.every(a => counts.every(b => key(a) !== key(b) || a.drinksLeft === b.drinksLeft));
  const keyOf: (t: (typeof counts)[number]) => string =
    counts.every(t => t.drinksLeft === counts[0].drinksLeft) ? () => ''
      : same(t => t.milk) && options.milks.length > 1 ? t => milkLabel[t.milk]
        : same(t => t.temperature) && options.temperatures.length > 1 ? t => temperatureLabel[t.temperature]
          : t => `${temperatureLabel[t.temperature]}, ${milkLabel[t.milk]}`;
  const groups = new Map<string, CapacityGroup>();
  for (const type of counts) {
    if (type.drinksLeft === null) continue;
    const label = keyOf(type); const group = groups.get(label);
    if (!group) { groups.set(label, { label, drinksLeft: type.drinksLeft, limits: type.limits }); continue; }
    // Merge: keep each ingredient's lowest figure across the merged types.
    const byItem = new Map(group.limits.map(limit => [limit.item, limit]));
    for (const limit of type.limits) if (!byItem.has(limit.item) || limit.drinksLeft < byItem.get(limit.item)!.drinksLeft) byItem.set(limit.item, limit);
    group.limits = [...byItem.values()].sort((a, b) => a.drinksLeft - b.drinksLeft || a.item.localeCompare(b.item));
    group.drinksLeft = Math.min(group.drinksLeft, type.drinksLeft);
  }
  const sorted = [...groups.values()].sort((a, b) => a.drinksLeft - b.drinksLeft || a.label.localeCompare(b.label));
  return { drinksLeft: sorted[0].drinksLeft, groups: sorted, missing };
}

/** Capacity for every drink that pours a published recipe, keyed by menu item. */
export function drinkCapacities(drinks: { id: string; options: Omit<MenuOptions, 'defaults'> }[], links: DrinkLinks, recipes: Map<string, RecipeRef>, stock: Map<string, StockLine>) {
  const out = new Map<string, DrinkCapacity>();
  for (const drink of drinks) {
    const serving = servingBody(drink.id, links, recipes);
    if (serving.body) out.set(drink.id, drinkCapacity(serving.body, drink.options, stock));
  }
  return out;
}

export type DrinkWarning = { menuItemId: string; name: string; drinksLeft: number; groups: CapacityGroup[] };
/**
 * Drinks with a type stock can make `threshold` or fewer more of. Each warned type lists every ingredient at or under
 * the threshold, so a second ingredient about to run out is not hidden behind the first.
 */
export function drinkWarnings(drinks: { id: string; name: string; options: Omit<MenuOptions, 'defaults'> }[], links: DrinkLinks, recipes: Map<string, RecipeRef>, stock: Map<string, StockLine>, threshold = DRINKS_LEFT_WARNING): DrinkWarning[] {
  const capacities = drinkCapacities(drinks, links, recipes, stock);
  const warnings: DrinkWarning[] = [];
  for (const drink of drinks) {
    const capacity = capacities.get(drink.id);
    if (!capacity || capacity.drinksLeft === null || capacity.drinksLeft > threshold) continue;
    const groups = capacity.groups.filter(group => group.drinksLeft <= threshold).map(group => ({ ...group, limits: group.limits.filter(limit => limit.drinksLeft <= threshold) }));
    warnings.push({ menuItemId: drink.id, name: drink.name, drinksLeft: capacity.drinksLeft, groups });
  }
  return warnings.sort((a, b) => a.drinksLeft - b.drinksLeft || a.name.localeCompare(b.name));
}

/** Cheapest and dearest ingredient cost of one drink over its allowed choices. */
export function drinkCostRange(body: RecipeBody, options: Omit<MenuOptions, 'defaults'>, stock: Map<string, { costPerUnit: number }>) {
  const costs = configurationsFor(options).map(configuration => [...addDrinkUsage(new Map(), body, configuration, 1)].reduce((sum, [item, amount]) => sum + amount * (stock.get(item)?.costPerUnit ?? 0), 0));
  return costs.length ? { min: Math.min(...costs), max: Math.max(...costs) } : { min: 0, max: 0 };
}

// ---------------------------------------------------------------- import
// A file can carry only some columns or keys, for example a count sheet with just Item, Supplier, Bag size and Sealed
// bags. Merging into an existing item touches only what the file provides, so a partial file never resets the rest.

export type ImportFields = { category: boolean; unit: boolean; openAmount: boolean; par: boolean; notes: boolean; sealedBags: boolean; costPerBag: boolean; preferred: boolean };
export type ImportItem = ItemFields & { provided: ImportFields };
export const ALL_FIELDS: ImportFields = { category: true, unit: true, openAmount: true, par: true, notes: true, sealedBags: true, costPerBag: true, preferred: true };

// ------------------------------------------------------------------- CSV
// One row per purchase option, so each supplier and bag size is counted on its own line. Rows sharing an Item name
// form one ingredient: item-level fields come from its first row and open amounts are summed. The prototype's
// one-row-per-item sheets, with "Cost per unit" instead of "Cost per bag", still import.

export const CSV_COLUMNS = ['Item', 'Category', 'Unit', 'Supplier', 'Bag size', 'Sealed bags', 'Open bag', 'Qty on hand', 'Par level', 'Cost per bag', 'Cost per unit', 'Preferred', 'Notes'] as const;
const CSV_ALIASES: Record<string, string[]> = { 'Bag size': ['Pack size'], 'Sealed bags': ['Packs on hand', 'Packs'], 'Open bag': ['Loose/open', 'Loose'] };
const textCell = (value: string) => value.replace(/^([=+@-])/, "'$1");
function csvCell(value: string | number) { const s = String(value ?? ''); return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; }

export function inventoryToCsv(items: ItemFields[]) {
  const sorted = [...items].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  const lines = [CSV_COLUMNS.join(',')];
  for (const item of sorted) {
    const options: (ItemFields['packages'][number] | null)[] = item.packages.length ? item.packages : [null];
    options.forEach((option, index) => {
      const first = index === 0; const open = first ? item.openAmount : 0;
      lines.push([
        textCell(item.name), textCell(item.category), item.unit, textCell(option?.supplier ?? ''), option?.bagSize ?? '', option?.sealedBags ?? '',
        first ? open : '', round((option ? option.bagSize * option.sealedBags : 0) + open), first ? item.par : '',
        option?.costPerBag ?? '', option ? round(perUnit(option), 6) : '', option?.preferred ? 'yes' : '', first ? textCell(item.notes) : '',
      ].map(csvCell).join(','));
    });
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}

/** Minimal RFC 4180 reader: quoted fields, embedded commas, quotes and newlines. */
export function parseCsv(text: string) {
  const rows: string[][] = []; let row: string[] = []; let field = ''; let quoted = false;
  const src = String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) { if (c === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += c; }
    else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(cell => cell.trim() !== ''));
}

/**
 * Columns are matched by header name, so order does not matter. "Qty on hand" is ignored: it is always derived.
 * A bad row skips its whole ingredient, so a partial ingredient is never imported.
 */
export function csvToInventory(text: string) {
  const rows = parseCsv(text); const errors: string[] = [];
  if (!rows.length) return { items: [] as ImportItem[], errors: ['Nothing to import.'] };
  const header = rows[0].map(h => h.trim().toLowerCase());
  const col = (name: string) => [name, ...(CSV_ALIASES[name] ?? [])].map(n => header.indexOf(n.toLowerCase())).find(at => at >= 0) ?? -1;
  const nameAt = col('Item');
  if (nameAt < 0) return { items: [] as ImportItem[], errors: ['No "Item" column found. Keep the header row from the export.'] };
  const at = { category: col('Category'), unit: col('Unit'), supplier: col('Supplier'), bagSize: col('Bag size'), sealedBags: col('Sealed bags'), openBag: col('Open bag'), par: col('Par level'), costPerBag: col('Cost per bag'), costPerUnit: col('Cost per unit'), preferred: col('Preferred'), notes: col('Notes') };
  const get = (r: string[], i: number) => (i >= 0 && r[i] !== undefined ? r[i].trim().replace(/^'([=+@-])/, '$1') : '');
  const provided: ImportFields = { category: at.category >= 0, unit: at.unit >= 0, openAmount: at.openBag >= 0, par: at.par >= 0, notes: at.notes >= 0, sealedBags: at.sealedBags >= 0, costPerBag: at.costPerBag >= 0 || at.costPerUnit >= 0, preferred: at.preferred >= 0 };
  const byName = new Map<string, ImportItem>(); const rejected = new Set<string>();
  rows.slice(1).forEach((r, index) => {
    const name = get(r, nameAt); if (!name || rejected.has(name)) return;
    const reject = (message: string) => { errors.push(`Row ${index + 2} (${name}): ${message}`); rejected.add(name); byName.delete(name); };
    const unit = get(r, at.unit) || 'each';
    if (!(units as readonly string[]).includes(unit)) return reject(`unit "${unit}" is not ml, g or each.`);
    const numbers = { bagSize: get(r, at.bagSize), sealedBags: get(r, at.sealedBags), openBag: get(r, at.openBag), par: get(r, at.par), costPerBag: get(r, at.costPerBag), costPerUnit: get(r, at.costPerUnit) };
    const bad = Object.values(numbers).find(value => value !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0));
    if (bad !== undefined) return reject(`"${bad}" is not a number of zero or more.`);
    let item = byName.get(name);
    if (!item) {
      const category = get(r, at.category);
      item = { name, unit: unit as ItemFields['unit'], category: (itemCategories as readonly string[]).includes(category) ? category as ItemFields['category'] : 'Other', openAmount: 0, par: finite(numbers.par), notes: get(r, at.notes), packages: [], provided };
      byName.set(name, item);
    } else if (item.unit !== unit) return reject(`unit "${unit}" differs from this item's earlier rows.`);
    item.openAmount = round(item.openAmount + finite(numbers.openBag));
    const bagSize = finite(numbers.bagSize);
    if (bagSize <= 0) return;
    const supplier = get(r, at.supplier);
    if (item.packages.some(option => packageKey(option.supplier, option.bagSize) === packageKey(supplier, bagSize))) return reject(`the purchase option "${supplier || 'no supplier'}, ${bagSize}" appears more than once.`);
    const costPerBag = numbers.costPerBag !== '' ? finite(numbers.costPerBag) : round(finite(numbers.costPerUnit) * bagSize, 4);
    const preferred = /^(yes|y|true|1|x)$/i.test(get(r, at.preferred));
    if (preferred && item.packages.some(option => option.preferred)) return reject('more than one purchase option is marked preferred.');
    item.packages.push({ supplier, bagSize, costPerBag, sealedBags: finite(numbers.sealedBags), preferred });
  });
  return { items: [...byName.values()], errors };
}

// ---------------------------------------------------------------- bundle

export type BundleRecipe = { slug: string; status: 'published' | 'draft'; body: RecipeBody };
/**
 * One JSON file holding inventory, equipment and recipes. Each inventory row keeps the prototype's single-bag shape,
 * using the option to buy next, with sealed bags expressed in that size so bagSize × sealedBags + openBag is still the
 * total. `costPerBag` and the full `packages` list are additive fields the portal reads back.
 */
export function buildBundle(items: ItemFields[], equipment: EquipmentFields[], recipes: { slug: string; published: RecipeBody | null; draft: RecipeBody | null }[], exportedAt = new Date()) {
  return {
    format: BUNDLE_FORMAT, version: BUNDLE_VERSION, exportedAt: exportedAt.toISOString(),
    inventory: items.map(item => {
      const next = reorderOption(item.packages);
      const sealedUnits = item.packages.reduce((sum, option) => sum + option.bagSize * option.sealedBags, 0);
      return {
        name: item.name, category: item.category, unit: item.unit,
        bagSize: next?.bagSize ?? 0, sealedBags: next ? round(sealedUnits / next.bagSize, 6) : 0, openBag: item.openAmount,
        par: item.par, costPerUnit: round(unitCost(item.packages), 6), costPerBag: next?.costPerBag ?? 0, supplier: next?.supplier ?? '', notes: item.notes,
        packages: item.packages.map(({ supplier, bagSize, costPerBag, sealedBags, preferred }) => ({ supplier, bagSize, costPerBag, sealedBags, preferred })),
      };
    }),
    equipment: equipment.map(item => ({ name: item.name, category: item.category, quantity: item.quantity, status: item.status, location: item.location, custodian: item.custodian, serial: item.serial, notes: item.notes, lastCheckedAt: item.lastCheckedAt })),
    // A recipe with unpublished edits exports its published body: the bundle carries what is actually served.
    recipes: recipes.map(recipe => {
      const body = recipe.published ?? recipe.draft ?? emptyBody();
      return { slug: recipe.slug, name: body.name, category: body.category, status: recipe.published ? 'published' : 'draft', ingredients: body.ingredients.map(i => ({ ...i })), steps: [...body.steps], notes: body.notes };
    }),
    guidelines: [],
  };
}

// A prototype row becomes one ingredient with one purchase option; a portal row brings its own `packages` list.
const bundleInventorySchema = bundleItemSchema.transform((row, context): ItemFields => {
  const bagSize = row.bagSize ?? 0;
  const item = itemFieldsSchema.safeParse({
    name: row.name, category: row.category, unit: row.unit, openAmount: row.openBag ?? 0, par: row.par ?? 0, notes: row.notes,
    packages: row.packages ?? (bagSize > 0 ? [{ supplier: row.supplier, bagSize, costPerBag: row.costPerBag ?? round((row.costPerUnit ?? 0) * bagSize, 4), sealedBags: row.sealedBags ?? 0, preferred: false }] : []),
  });
  if (item.success) return item.data;
  for (const issue of item.error.issues) context.addIssue({ code: 'custom', message: issue.message });
  return z.NEVER;
});

/**
 * Validate a parsed bundle before anything is written. Rows that fail are skipped and named, never silently accepted.
 * Import matches inventory and equipment by name and recipes by slug, and never deletes.
 */
export function readBundle(parsed: unknown) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false as const, error: 'That is not a bundle file.' };
  const envelope = bundleEnvelopeSchema.safeParse(parsed);
  if (!envelope.success) return { ok: false as const, error: 'That is not a bundle file.' };
  const value = envelope.data;
  if (value.format !== BUNDLE_FORMAT) return { ok: false as const, error: `Expected a "${BUNDLE_FORMAT}" file, got ${value.format ? `"${value.format}"` : 'no format field'}.` };
  if ((value.version ?? 0) > BUNDLE_VERSION) return { ok: false as const, error: `This bundle is version ${value.version} and the portal reads up to ${BUNDLE_VERSION}.` };
  const skipped: string[] = [];
  const label = (row: unknown, kind: string, index: number) => (row && typeof row === 'object' && 'name' in row && typeof row.name === 'string' && row.name ? `${kind} "${row.name}"` : `${kind} row ${index + 1}`);
  const take = <T,>(rows: unknown[] | undefined, kind: string, schema: z.ZodType<T>, key: (row: T) => string) => {
    const out: T[] = []; const seen = new Set<string>();
    (rows ?? []).forEach((row, index) => {
      const result = schema.safeParse(row);
      if (!result.success) { skipped.push(`${label(row, kind, index)}: ${result.error.issues[0]?.message ?? 'invalid'}`); return; }
      const k = key(result.data);
      if (seen.has(k)) { skipped.push(`${label(row, kind, index)}: appears more than once`); return; }
      seen.add(k); out.push(result.data);
    });
    return out;
  };
  // Which keys each row really has, so a merge leaves out what the file does not mention.
  const keysOf = (rows: unknown[] | undefined) => new Map((rows ?? []).flatMap(row => row && typeof row === 'object' && 'name' in row && typeof row.name === 'string' ? [[row.name.trim(), new Set(Object.keys(row))] as const] : []));
  const itemKeys = keysOf(value.inventory); const equipmentKeys = keysOf(value.equipment);
  const inventory: ImportItem[] = take(value.inventory, 'inventory', bundleInventorySchema, row => row.name).map(item => {
    const has = (...keys: string[]) => keys.some(key => itemKeys.get(item.name)?.has(key));
    return { ...item, provided: { category: has('category'), unit: true, openAmount: has('openBag'), par: has('par'), notes: has('notes'), sealedBags: has('sealedBags', 'packages'), costPerBag: has('costPerBag', 'costPerUnit', 'packages'), preferred: has('packages') } };
  });
  const equipment = take(value.equipment, 'equipment', bundleEquipmentSchema, row => row.name)
    .map(row => ({ ...row, provided: new Set([...(equipmentKeys.get(row.name) ?? [])].filter(key => key in row)) as Set<keyof EquipmentFields> }));
  const recipes: BundleRecipe[] = take(value.recipes, 'recipe', bundleRecipeSchema, row => row.slug ? slugify(row.slug) : slugify(row.name))
    .map(row => ({ slug: row.slug ? slugify(row.slug) : slugify(row.name), status: row.status, body: { name: row.name, category: row.category, ingredients: row.ingredients, steps: row.steps, notes: row.notes } }));
  return { ok: true as const, inventory, equipment, recipes, skipped, guidelines: value.guidelines?.length ?? 0 };
}
