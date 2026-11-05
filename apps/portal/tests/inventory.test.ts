import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildBundle, checkRecipe, countedQuantity, csvToInventory, demandRows, eventPlan, ingredientAmount, inventoryToCsv, readBundle, slugify, stockStatus, usageFromLogs,
  type RecipeRef, type StockLine,
} from '../lib/inventory';
import type { ItemFields, RecipeBody } from '../lib/validations/inventory';
import type { Configuration } from '../lib/validations/pos';

const iced: Configuration = { temperature: 'Iced', milk: 'Oat', syrup: 50, ice: 'Light' };
const hot: Configuration = { temperature: 'Hot', milk: 'Whole', syrup: 100 };
const latte: RecipeBody = {
  name: 'Pumpkin Spice Latte', category: 'Espresso', steps: [], notes: '',
  ingredients: [
    { item: 'Espresso beans', qty: 18, unit: 'g', note: '', when: 'always', scale: 'fixed' },
    { item: 'Whole milk', qty: 200, unit: 'ml', note: '', when: 'whole', scale: 'fixed' },
    { item: 'Oat milk', qty: 200, unit: 'ml', note: '', when: 'oat', scale: 'fixed' },
    { item: 'Pumpkin syrup', qty: 30, unit: 'ml', note: '', when: 'always', scale: 'syrup' },
    { item: 'Ice', qty: 150, unit: 'g', note: '', when: 'iced', scale: 'ice' },
    { item: 'Hot cups', qty: 1, unit: 'each', note: '', when: 'hot', scale: 'fixed' },
    { item: 'Cold cups', qty: 1, unit: 'each', note: '', when: 'iced', scale: 'fixed' },
  ],
};
const item = (name: string, overrides: Partial<ItemFields> = {}): ItemFields => ({ name, category: 'Other', unit: 'ml', bagSize: 0, sealedBags: 0, openBag: 0, par: 0, costPerUnit: 0, supplier: '', notes: '', ...overrides });

test('quantity on hand is derived from sealed bags plus the open bag, and status follows par', () => {
  assert.equal(countedQuantity({ bagSize: 946, sealedBags: 8, openBag: 120 }), 7688);
  assert.equal(stockStatus(0, 100), 'out');
  assert.equal(stockStatus(-5, 0), 'out');
  assert.equal(stockStatus(100, 100), 'low');
  assert.equal(stockStatus(101, 100), 'ok');
  assert.equal(stockStatus(1, 0), 'ok');
});

test('recipe lines follow the POS configuration: milk, temperature, syrup percent and ice level', () => {
  const amounts = (configuration: Configuration) => Object.fromEntries(latte.ingredients.map(line => [line.item, ingredientAmount(line, configuration)]));
  assert.deepEqual(amounts(iced), { 'Espresso beans': 18, 'Whole milk': 0, 'Oat milk': 200, 'Pumpkin syrup': 15, Ice: 75, 'Hot cups': 0, 'Cold cups': 1 });
  assert.deepEqual(amounts(hot), { 'Espresso beans': 18, 'Whole milk': 200, 'Oat milk': 0, 'Pumpkin syrup': 30, Ice: 0, 'Hot cups': 1, 'Cold cups': 0 });
  assert.equal(ingredientAmount({ when: 'always', scale: 'ice', qty: 150 }, { ...iced, ice: 'None' }), 0);
  assert.equal(ingredientAmount({ when: 'always', scale: 'ice', qty: 150 }, { ...iced, ice: 'Full' }), 150);
  assert.equal(ingredientAmount({ when: 'always', scale: 'ice', qty: 150 }, hot), 0, 'hot drinks never use ice');
});

test('usage from logs counts only published linked recipes and respects each item count time', () => {
  const recipes = new Map<string, RecipeRef>([['r1', { id: 'r1', name: 'PSL', published: latte }], ['r2', { id: 'r2', name: 'Draft', published: null }]]);
  const links = new Map<string, string | null>([['m1', 'r1'], ['m2', 'r2'], ['m3', null]]);
  const logs = [
    { menuItemId: 'm1', configuration: iced, quantity: 2, recordedAt: '2026-10-01T15:00:00Z' },
    { menuItemId: 'm1', configuration: hot, quantity: 1, recordedAt: '2026-10-01T16:00:00Z' },
    { menuItemId: 'm2', configuration: hot, quantity: 4, recordedAt: '2026-10-01T16:00:00Z' },
    { menuItemId: 'm3', configuration: hot, quantity: 3, recordedAt: '2026-10-01T16:00:00Z' },
    { menuItemId: 'unknown', configuration: hot, quantity: 1, recordedAt: '2026-10-01T16:00:00Z' },
  ];
  const all = usageFromLogs(logs, links, recipes);
  assert.equal(all.drinksCounted, 3); assert.equal(all.drinksUnpublished, 4); assert.equal(all.drinksUnlinked, 4);
  assert.equal(all.byItem.get('Espresso beans'), 54);
  assert.equal(all.byItem.get('Oat milk'), 400);
  assert.equal(all.byItem.get('Whole milk'), 200);
  assert.equal(all.byItem.get('Pumpkin syrup'), 60);
  assert.equal(all.byItem.has('Hot cups'), true);

  // Beans were recounted between the two orders; milk was never counted, so nothing is deducted from it.
  const since = usageFromLogs(logs, links, recipes, new Map([['Espresso beans', new Date('2026-10-01T15:30:00Z')], ['Oat milk', new Date('2026-10-01T15:00:00Z')]]));
  assert.equal(since.byItem.get('Espresso beans'), 18);
  assert.equal(since.byItem.has('Oat milk'), false, 'a log recorded exactly at the count time is already in the count');
  assert.equal(since.byItem.has('Whole milk'), false);
});

test('event plans use each drink default, total demand and round shortfalls up to whole bags', () => {
  const recipes = new Map<string, RecipeRef>([['r1', { id: 'r1', name: 'PSL', published: latte }]]);
  const stock = new Map<string, StockLine>([
    ['Espresso beans', { name: 'Espresso beans', unit: 'g', bagSize: 1000, costPerUnit: 0.02, onHand: 1500 }],
    ['Oat milk', { name: 'Oat milk', unit: 'ml', bagSize: 946, costPerUnit: 0.004, onHand: -100 }],
  ]);
  const plan = eventPlan([
    { menuItemId: 'm1', name: 'PSL', defaults: iced, plannedServings: 100 },
    { menuItemId: 'm2', name: 'Cider', defaults: hot, plannedServings: 20 },
    { menuItemId: 'm3', name: 'Not planned', defaults: hot, plannedServings: 0 },
  ], new Map([['m1', 'r1'], ['m2', null]]), recipes, stock);
  assert.equal(plan.drinks, 100);
  assert.deepEqual(plan.unlinked, ['Cider']);
  const beans = plan.rows.find(row => row.item === 'Espresso beans')!;
  assert.deepEqual([beans.needed, beans.short, beans.buyBags], [1800, 300, 1]);
  const oat = plan.rows.find(row => row.item === 'Oat milk')!;
  assert.deepEqual([oat.needed, oat.short, oat.buyBags], [20000, 20000, 22], 'an overdrawn estimate is treated as empty');
  assert.equal(plan.rows.find(row => row.item === 'Whole milk'), undefined);
  assert.deepEqual(plan.missing.map(row => row.item), ['Cold cups', 'Ice', 'Pumpkin syrup'], 'the iced default needs no hot cups');
  assert.equal(demandRows(new Map([['Espresso beans', 10]]), stock)[0].enough, true);
});

test('recipe cards report the servings stock supports from lines every drink needs', () => {
  const stock = new Map([['Espresso beans', { unit: 'g', onHand: 100, costPerUnit: 0.02 }], ['Oat milk', { unit: 'ml', onHand: 0, costPerUnit: 0 }]]);
  const check = checkRecipe(latte, 10, stock);
  assert.equal(check.maxServings, 5, 'conditional oat milk does not cap the card');
  assert.equal(check.short.length, 2);
  assert.equal(check.missing.length, 5);
});

test('inventory CSV round-trips, accepts old headers and skips bad rows with a reason', () => {
  const items = [item('Oat milk', { category: 'Milk', bagSize: 946, sealedBags: 8, openBag: 0, par: 6000, costPerUnit: 0.0042, supplier: 'Costco', notes: '32 oz, "barista"' }), item('=cmd', { unit: 'each' })];
  const csv = inventoryToCsv(items);
  assert(csv.includes("'=cmd"), 'formula-like text is neutralised for spreadsheets');
  const back = csvToInventory(csv);
  assert.deepEqual(back.errors, []);
  assert.deepEqual(back.items.sort((a, b) => a.name.localeCompare(b.name)), [...items].sort((a, b) => a.name.localeCompare(b.name)));

  const legacy = csvToInventory('Item,Unit,Pack size,Packs,Loose,Qty on hand,Category\nBeans,g,1000,2,250,99999,Coffee\nIce,cups,1,1,1,1,Other\nBeans,g,1,1,1,1,Coffee\nSalt,g,abc,1,1,1,Topping');
  assert.deepEqual(legacy.items.map(row => [row.name, row.bagSize, row.sealedBags, row.openBag, row.category]), [['Beans', 1000, 2, 250, 'Coffee']]);
  assert.equal(legacy.errors.length, 3);
  assert.match(csvToInventory('Name,Unit\nx,g').errors[0], /No "Item" column/);
});

test('bundles match the prototype exchange format and report every skipped row', () => {
  const bundle = buildBundle([item('Whole milk')], [{ name: 'Cart', category: 'Furniture', quantity: 1, status: 'ok', location: '', custodian: '', serial: '', notes: '', lastCheckedAt: '' }], [
    { slug: 'psl', published: latte, draft: { ...latte, name: 'PSL v2' } },
    { slug: 'draft-only', published: null, draft: { ...latte, name: 'Draft only' } },
  ], new Date('2026-11-05T00:00:00Z'));
  assert.equal(bundle.format, 'lattelab-data'); assert.equal(bundle.version, 1);
  assert.deepEqual(bundle.recipes.map(r => [r.slug, r.name, r.status]), [['psl', 'Pumpkin Spice Latte', 'published'], ['draft-only', 'Draft only', 'draft']]);

  const read = readBundle(JSON.parse(JSON.stringify(bundle)));
  assert(read.ok);
  assert.equal(read.inventory[0].name, 'Whole milk');
  assert.equal(read.recipes[0].body.ingredients[4].scale, 'ice');

  // Prototype rows have no when/scale and use names that need slugging; bad rows are skipped, not fatal.
  const prototype = readBundle({ format: 'lattelab-data', version: 1, guidelines: [{}, {}],
    inventory: [{ name: 'Beans', unit: 'g', bagSize: 1000, sealedBags: 1, openBag: 0, par: 0, costPerUnit: 0.02, category: 'Coffee', supplier: '', notes: '' }, { name: 'Pumps', unit: 'pump' }, { unit: 'g' }],
    recipes: [{ name: 'Vanilla Latte', category: 'Espresso', status: 'published', ingredients: [{ item: 'Beans', qty: 18, unit: 'g', note: '' }], steps: ['Pull'], notes: '' }, { name: 'Empty', ingredients: [] }],
    equipment: [{ name: 'Gaggia', category: 'Machine', quantity: 1, status: 'broken' }],
  });
  assert(prototype.ok);
  assert.deepEqual(prototype.recipes.map(r => [r.slug, r.body.ingredients[0].when, r.body.ingredients[0].scale]), [['vanilla-latte', 'always', 'fixed']]);
  assert.equal(prototype.inventory.length, 1);
  assert.equal(prototype.equipment.length, 0);
  assert.equal(prototype.skipped.length, 4);
  assert.equal(prototype.guidelines, 2);

  assert.deepEqual(readBundle({ format: 'other' }), { ok: false, error: 'Expected a "lattelab-data" file, got "other".' });
  assert.equal(readBundle({ format: 'lattelab-data', version: 2 }).ok, false);
  assert.equal(readBundle([]).ok, false);
  assert.equal(slugify('Oat milk — barista'), 'oat-milk-barista');
});
