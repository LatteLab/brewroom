// Inventory domain rules. Pure functions only: no database and no React, so they can be tested directly.
// Ported from the prototype's schema.js (LatteLab/inventory-system-draft) and extended so recipes respond to
// POS drink configurations. See docs/specs/2026-11-05-inventory/design.md.
import type { z } from 'zod';
import type { Configuration } from './validations/pos';
import {
  BUNDLE_FORMAT, BUNDLE_VERSION, bundleEnvelopeSchema, bundleEquipmentSchema, bundleItemSchema, bundleRecipeSchema,
  equipmentStatuses, itemCategories, units,
  type EquipmentFields, type Ingredient, type ItemFields, type RecipeBody,
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

export type StockFields = Pick<ItemFields, 'bagSize' | 'sealedBags' | 'openBag'>;
/** Units physically counted: sealed bags plus whatever is left in the open one. Never stored. */
export function countedQuantity(item: StockFields) { return round(item.bagSize * item.sealedBags + item.openBag); }
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

export type CheckRow = { item: string; note: string; when: Ingredient['when']; scale: Ingredient['scale']; unit: string; perServing: number; needed: number; onHand: number | null; known: boolean; enough: boolean; short: number; cost: number; allows: number | null };
/**
 * Scale a recipe card and check it against stock. Conditional and scaled lines are shown at their full amount,
 * because a card is not one configuration; "stock supports" uses only lines every drink needs.
 */
export function checkRecipe(body: RecipeBody, servings: number, stock: Map<string, { unit: string; onHand: number; costPerUnit: number }>) {
  const n = Math.max(0, finite(servings));
  const rows: CheckRow[] = body.ingredients.map(ingredient => {
    const item = stock.get(ingredient.item) ?? null;
    const needed = round(ingredient.qty * n);
    const known = item !== null; const onHand = item ? item.onHand : null;
    const enough = known && (onHand ?? 0) >= needed;
    return {
      item: ingredient.item, note: ingredient.note, when: ingredient.when, scale: ingredient.scale,
      unit: item?.unit ?? ingredient.unit, perServing: ingredient.qty, needed, onHand, known, enough,
      short: known && !enough ? round(needed - (onHand ?? 0)) : 0,
      cost: item ? needed * item.costPerUnit : 0,
      allows: item && ingredient.qty > 0 && ingredient.when === 'always' ? Math.max(0, Math.floor(item.onHand / ingredient.qty)) : null,
    };
  });
  const allows = rows.map(row => row.allows).filter((value): value is number => value !== null);
  return {
    rows, missing: rows.filter(row => !row.known), short: rows.filter(row => row.known && !row.enough),
    cost: rows.reduce((sum, row) => sum + row.cost, 0), maxServings: allows.length ? Math.min(...allows) : null,
  };
}

// ----------------------------------------------------- POS synchronization

export type UsageLog = { menuItemId: string; configuration: Configuration; quantity: number; recordedAt: Date | string };
export type RecipeRef = { id: string; name: string; published: RecipeBody | null };
export type DrinkLinks = Map<string, string | null>; // POS menu item id -> recipe id
export function recipeRefs(recipes: ({ id: string } & RecipeDoc)[]) {
  return new Map<string, RecipeRef>(recipes.map(recipe => [recipe.id, { id: recipe.id, name: workingBody(recipe).name, published: recipe.published }]));
}

function servingBody(menuItemId: string, links: DrinkLinks, recipes: Map<string, RecipeRef>) {
  const recipeId = links.get(menuItemId) ?? null;
  if (!recipeId) return { status: 'unlinked' as const, body: null };
  const recipe = recipes.get(recipeId);
  if (!recipe?.published) return { status: 'unpublished' as const, body: null };
  return { status: 'ok' as const, body: recipe.published };
}

/**
 * Ingredient use implied by valid POS drink logs. Only the published body of a linked recipe counts, matching the
 * prototype's rule that drafts are never served. `countedAt` limits each item to drinks recorded after its last
 * count, which is how the stock view estimates what is left without ever writing to the count.
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

export type StockLine = { name: string; unit: string; bagSize: number; costPerUnit: number; onHand: number };
export function stockMap(items: StockLine[]) {
  return new Map<string, StockLine>(items.map(({ name, unit, bagSize, costPerUnit, onHand }) => [name, { name, unit, bagSize, costPerUnit, onHand }]));
}
export type DemandRow = { item: string; unit: string; needed: number; onHand: number | null; known: boolean; enough: boolean; short: number; cost: number; buyBags: number; bagSize: number };
/** Compare a per-item demand total against stock, with a shopping line rounded up to whole sealed bags. */
export function demandRows(totals: Map<string, number>, stock: Map<string, StockLine>): DemandRow[] {
  return [...totals.entries()].map(([name, rawNeeded]) => {
    const item = stock.get(name) ?? null; const needed = round(rawNeeded);
    const known = item !== null; const onHand = item ? item.onHand : null;
    const enough = known && (onHand ?? 0) >= needed;
    const shortBy = known && !enough ? round(needed - Math.max(0, onHand ?? 0)) : 0;
    return {
      item: name, unit: item?.unit ?? '', needed, onHand, known, enough, short: shortBy,
      cost: item ? needed * item.costPerUnit : 0,
      buyBags: item && shortBy > 0 && item.bagSize > 0 ? Math.ceil(shortBy / item.bagSize) : 0,
      bagSize: item?.bagSize ?? 0,
    };
  }).sort((a, b) => a.item.localeCompare(b.item));
}

export type PlanDrink = { menuItemId: string; name: string; defaults: Configuration; plannedServings: number };
/**
 * Ingredient demand for an event's planned servings. Configuration is not known before service, so each drink is
 * planned at its menu default choices.
 */
export function eventPlan(menu: PlanDrink[], links: DrinkLinks, recipes: Map<string, RecipeRef>, stock: Map<string, StockLine>) {
  const totals = new Map<string, number>();
  const unlinked: string[] = []; const unpublished: string[] = [];
  let drinks = 0;
  for (const drink of menu) {
    if (drink.plannedServings <= 0) continue;
    const serving = servingBody(drink.menuItemId, links, recipes);
    if (!serving.body) { (serving.status === 'unlinked' ? unlinked : unpublished).push(drink.name); continue; }
    drinks += drink.plannedServings;
    addDrinkUsage(totals, serving.body, drink.defaults, drink.plannedServings);
  }
  const rows = demandRows(totals, stock);
  return { rows, drinks, unlinked, unpublished, short: rows.filter(row => row.known && !row.enough), missing: rows.filter(row => !row.known), cost: rows.reduce((sum, row) => sum + row.cost, 0) };
}

// ------------------------------------------------------------------- CSV
// Same columns as the prototype and its counting spreadsheet, so a counted sheet pastes straight back in.

export const CSV_COLUMNS = ['Item', 'Category', 'Unit', 'Bag size', 'Sealed bags', 'Open bag', 'Qty on hand', 'Par level', 'Cost per unit', 'Supplier', 'Notes'] as const;
const CSV_ALIASES: Record<string, string[]> = { 'Bag size': ['Pack size'], 'Sealed bags': ['Packs on hand', 'Packs'], 'Open bag': ['Loose/open', 'Loose'] };
const textCell = (value: string) => value.replace(/^([=+@-])/, "'$1");
function csvCell(value: string | number) { const s = String(value ?? ''); return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; }

export function inventoryToCsv(items: ItemFields[]) {
  const sorted = [...items].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  const lines = [CSV_COLUMNS.join(',')];
  for (const item of sorted) {
    lines.push([textCell(item.name), textCell(item.category), item.unit, item.bagSize, item.sealedBags, item.openBag, countedQuantity(item), item.par, item.costPerUnit, textCell(item.supplier), textCell(item.notes)].map(csvCell).join(','));
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

/** Columns are matched by header name, so order does not matter. "Qty on hand" is ignored: it is always derived. */
export function csvToInventory(text: string) {
  const rows = parseCsv(text); const errors: string[] = [];
  if (!rows.length) return { items: [] as ItemFields[], errors: ['Nothing to import.'] };
  const header = rows[0].map(h => h.trim().toLowerCase());
  const col = (name: string) => [name, ...(CSV_ALIASES[name] ?? [])].map(n => header.indexOf(n.toLowerCase())).find(at => at >= 0) ?? -1;
  const nameAt = col('Item');
  if (nameAt < 0) return { items: [], errors: ['No "Item" column found. Keep the header row from the export.'] };
  const at = { category: col('Category'), unit: col('Unit'), bagSize: col('Bag size'), sealedBags: col('Sealed bags'), openBag: col('Open bag'), par: col('Par level'), costPerUnit: col('Cost per unit'), supplier: col('Supplier'), notes: col('Notes') };
  const get = (r: string[], i: number) => (i >= 0 && r[i] !== undefined ? r[i].trim().replace(/^'([=+@-])/, '$1') : '');
  const items: ItemFields[] = []; const seen = new Set<string>();
  rows.slice(1).forEach((r, index) => {
    const name = get(r, nameAt); if (!name) return;
    const line = `Row ${index + 2} (${name})`;
    const unit = get(r, at.unit) || 'each';
    if (!(units as readonly string[]).includes(unit)) { errors.push(`${line}: unit "${unit}" is not ml, g or each.`); return; }
    if (seen.has(name)) { errors.push(`${line}: the item appears more than once.`); return; }
    const numbers = { bagSize: get(r, at.bagSize), sealedBags: get(r, at.sealedBags), openBag: get(r, at.openBag), par: get(r, at.par), costPerUnit: get(r, at.costPerUnit) };
    const bad = Object.entries(numbers).find(([, value]) => value !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0));
    if (bad) { errors.push(`${line}: "${bad[1]}" is not a number of zero or more.`); return; }
    const category = get(r, at.category);
    seen.add(name);
    items.push({
      name, unit: unit as ItemFields['unit'],
      category: (itemCategories as readonly string[]).includes(category) ? category as ItemFields['category'] : 'Other',
      bagSize: finite(numbers.bagSize), sealedBags: finite(numbers.sealedBags), openBag: finite(numbers.openBag), par: finite(numbers.par), costPerUnit: finite(numbers.costPerUnit),
      supplier: get(r, at.supplier), notes: get(r, at.notes),
    });
  });
  return { items, errors };
}

// ---------------------------------------------------------------- bundle

export type BundleRecipe = { slug: string; status: 'published' | 'draft'; body: RecipeBody };
/** One JSON file holding inventory, equipment and recipes, readable by the prototype and its build tools. */
export function buildBundle(items: ItemFields[], equipment: EquipmentFields[], recipes: { slug: string; published: RecipeBody | null; draft: RecipeBody | null }[], exportedAt = new Date()) {
  return {
    format: BUNDLE_FORMAT, version: BUNDLE_VERSION, exportedAt: exportedAt.toISOString(),
    inventory: items.map(item => ({ name: item.name, category: item.category, unit: item.unit, bagSize: item.bagSize, sealedBags: item.sealedBags, openBag: item.openBag, par: item.par, costPerUnit: item.costPerUnit, supplier: item.supplier, notes: item.notes })),
    equipment: equipment.map(item => ({ name: item.name, category: item.category, quantity: item.quantity, status: item.status, location: item.location, custodian: item.custodian, serial: item.serial, notes: item.notes, lastCheckedAt: item.lastCheckedAt })),
    // A recipe with unpublished edits exports its published body: the bundle carries what is actually served.
    recipes: recipes.map(recipe => {
      const body = recipe.published ?? recipe.draft ?? emptyBody();
      return { slug: recipe.slug, name: body.name, category: body.category, status: recipe.published ? 'published' : 'draft', ingredients: body.ingredients.map(i => ({ ...i })), steps: [...body.steps], notes: body.notes };
    }),
    guidelines: [],
  };
}

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
  const inventory = take(value.inventory, 'inventory', bundleItemSchema, row => row.name);
  const equipment = take(value.equipment, 'equipment', bundleEquipmentSchema, row => row.name);
  const recipes: BundleRecipe[] = take(value.recipes, 'recipe', bundleRecipeSchema, row => row.slug ? slugify(row.slug) : slugify(row.name))
    .map(row => ({ slug: row.slug ? slugify(row.slug) : slugify(row.name), status: row.status, body: { name: row.name, category: row.category, ingredients: row.ingredients, steps: row.steps, notes: row.notes } }));
  return { ok: true as const, inventory, equipment, recipes, skipped, guidelines: value.guidelines?.length ?? 0 };
}
