import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DRINKS_LEFT_WARNING, buildBundle, configurationsFor, countedQuantity, csvToInventory, demandRows, drinkCapacity, drinkCostRange, drinkWarnings, eventPlan, ingredientAmount,
  inventoryToCsv, readBundle, reorderOption, resolveDrinkRecipes, slugify, stockMap, stockStatus, unitCost, usageFromLogs,
  type LinkRow, type RecipeRef,
} from '../lib/inventory';
import { itemFieldsSchema, type ItemFields, type PackageFields, type RecipeBody } from '../lib/validations/inventory';
import { defaultMenuOptions, type Configuration } from '../lib/validations/pos';

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
const option = (overrides: Partial<PackageFields> = {}): PackageFields => ({ supplier: '', bagSize: 1000, costPerBag: 0, sealedBags: 0, preferred: false, ...overrides });
const item = (name: string, overrides: Partial<ItemFields> = {}): ItemFields => ({ name, category: 'Other', unit: 'ml', openAmount: 0, par: 0, notes: '', packages: [], ...overrides });
const onHand = (name: string, unit: string, amount: number, packages: PackageFields[] = []) => ({ name, unit, onHand: amount, packages });

test('quantity on hand adds every purchase option to the open amount, and status follows par', () => {
  assert.equal(countedQuantity({ openAmount: 120, packages: [option({ bagSize: 946, sealedBags: 8 })] }), 7688);
  assert.equal(countedQuantity({ openAmount: 500, packages: [option({ bagSize: 3785, sealedBags: 2 }), option({ bagSize: 1893, sealedBags: 1 })] }), 9963);
  assert.equal(stockStatus(0, 100), 'out');
  assert.equal(stockStatus(-5, 0), 'out');
  assert.equal(stockStatus(100, 100), 'low');
  assert.equal(stockStatus(101, 100), 'ok');
  assert.equal(stockStatus(1, 0), 'ok');
});

test('cost per unit is derived from cost per bag, averaged over sealed stock across suppliers and sizes', () => {
  const costco = option({ supplier: 'Costco', bagSize: 3785, costPerBag: 4.5, sealedBags: 2 });
  const star = option({ supplier: 'Star Market', bagSize: 1893, costPerBag: 3.2, sealedBags: 1 });
  assert.equal(unitCost([costco, star]), (4.5 * 2 + 3.2) / (3785 * 2 + 1893));
  // With nothing sealed, use the option to buy next: preferred first, otherwise the cheapest per unit.
  const empty = [{ ...costco, sealedBags: 0 }, { ...star, sealedBags: 0 }];
  assert.equal(reorderOption(empty)?.supplier, 'Costco');
  assert.equal(reorderOption([empty[0], { ...empty[1], preferred: true }])?.supplier, 'Star Market');
  assert.equal(unitCost(empty), 4.5 / 3785);
  assert.equal(unitCost([]), 0);
  assert.equal(itemFieldsSchema.safeParse(item('Milk', { packages: [costco, { ...costco, supplier: ' costco ' }] })).success, false, 'the same supplier and size twice is one option');
  assert.equal(itemFieldsSchema.safeParse(item('Milk', { packages: [{ ...costco, preferred: true }, { ...star, preferred: true }] })).success, false);
  assert.equal(itemFieldsSchema.safeParse(item('Milk', { packages: [{ ...costco, bagSize: 0 }] })).success, false);
});

test('recipe lines follow the POS configuration: milk, temperature, syrup percent and ice level', () => {
  const amounts = (configuration: Configuration) => Object.fromEntries(latte.ingredients.map(line => [line.item, ingredientAmount(line, configuration)]));
  assert.deepEqual(amounts(iced), { 'Espresso beans': 18, 'Whole milk': 0, 'Oat milk': 200, 'Pumpkin syrup': 15, Ice: 75, 'Hot cups': 0, 'Cold cups': 1 });
  assert.deepEqual(amounts(hot), { 'Espresso beans': 18, 'Whole milk': 200, 'Oat milk': 0, 'Pumpkin syrup': 30, Ice: 0, 'Hot cups': 1, 'Cold cups': 0 });
  assert.equal(ingredientAmount({ when: 'always', scale: 'ice', qty: 150 }, { ...iced, ice: 'None' }), 0);
  assert.equal(ingredientAmount({ when: 'always', scale: 'ice', qty: 150 }, { ...iced, ice: 'Full' }), 150);
  assert.equal(ingredientAmount({ when: 'always', scale: 'ice', qty: 150 }, hot), 0, 'hot drinks never use ice');
});

test('POS drinks use the published recipe with their name unless pinned or turned off', () => {
  const recipes = new Map<string, RecipeRef>([
    ['r1', { id: 'r1', name: 'Vanilla Latte', published: { ...latte, name: 'Vanilla Latte' } }],
    ['r2', { id: 'r2', name: 'Mocha', published: null }],
    ['r3', { id: 'r3', name: 'Chai', published: { ...latte, name: 'Chai' } }],
    ['r4', { id: 'r4', name: 'Chai', published: { ...latte, name: 'chai' } }],
  ]);
  const drinks = [{ id: 'a', name: 'vanilla latte' }, { id: 'b', name: 'Mocha' }, { id: 'c', name: 'Chai' }, { id: 'd', name: 'House special' }, { id: 'e', name: 'Vanilla Latte' }, { id: 'f', name: 'Vanilla Latte' }];
  const links = new Map<string, LinkRow>([['d', { menuItemId: 'd', recipeId: 'r1', track: true }], ['e', { menuItemId: 'e', recipeId: null, track: false }], ['f', { menuItemId: 'f', recipeId: null, track: true }]]);
  const { links: resolved, source } = resolveDrinkRecipes(drinks, links, recipes);
  assert.deepEqual(Object.fromEntries(resolved), { a: 'r1', b: null, c: null, d: 'r1', e: null, f: 'r1' });
  assert.deepEqual(Object.fromEntries(source), { a: 'auto', b: 'unmatched', c: 'unmatched', d: 'pinned', e: 'off', f: 'auto' }, 'an unpublished name and an ambiguous name match nothing');
});

test('usage from logs counts only published recipes and respects each item count time', () => {
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

  // Beans were recounted between the two orders; whole milk was never counted, so nothing is deducted from it.
  const since = usageFromLogs(logs, links, recipes, new Map([['Espresso beans', new Date('2026-10-01T15:30:00Z')], ['Oat milk', new Date('2026-10-01T15:00:00Z')]]));
  assert.equal(since.byItem.get('Espresso beans'), 18);
  assert.equal(since.byItem.has('Oat milk'), false, 'a log recorded exactly at the count time is already in the count');
  assert.equal(since.byItem.has('Whole milk'), false);
});

test('event plans use each drink default, total demand and buy whole bags of the option to buy', () => {
  const recipes = new Map<string, RecipeRef>([['r1', { id: 'r1', name: 'PSL', published: latte }]]);
  const stock = stockMap([
    onHand('Espresso beans', 'g', 1500, [option({ supplier: 'Roaster', bagSize: 1000, costPerBag: 20, sealedBags: 1 })]),
    onHand('Oat milk', 'ml', -100, [option({ supplier: 'Costco', bagSize: 946, costPerBag: 3.97 }), option({ supplier: 'Star', bagSize: 1893, costPerBag: 6, preferred: true })]),
  ]);
  const plan = eventPlan([
    { menuItemId: 'm1', name: 'PSL', defaults: iced, plannedServings: 100 },
    { menuItemId: 'm2', name: 'Cider', defaults: hot, plannedServings: 20 },
    { menuItemId: 'm3', name: 'Not planned', defaults: hot, plannedServings: 0 },
  ], new Map([['m1', 'r1'], ['m2', null]]), recipes, stock);
  assert.equal(plan.drinks, 100);
  assert.deepEqual(plan.unlinked, ['Cider']);
  const beans = plan.rows.find(row => row.item === 'Espresso beans')!;
  assert.deepEqual([beans.needed, beans.short, beans.buyBags, beans.buyLabel], [1800, 300, 1, 'Roaster · 1,000 g']);
  assert.equal(beans.cost, 1800 * 0.02);
  const oat = plan.rows.find(row => row.item === 'Oat milk')!;
  assert.deepEqual([oat.needed, oat.short, oat.buyBags, oat.buyLabel], [20000, 20000, 11, 'Star · 1,893 ml'], 'an overdrawn estimate is treated as empty; the preferred option is bought');
  assert.equal(plan.rows.find(row => row.item === 'Whole milk'), undefined);
  assert.deepEqual(plan.missing.map(row => row.item), ['Cold cups', 'Ice', 'Pumpkin syrup'], 'the iced default needs no hot cups');
  assert.equal(demandRows(new Map([['Espresso beans', 10]]), stock)[0].enough, true);
});

test('drinks you can make are reported by the choices that matter, with what runs out first', () => {
  assert.equal(configurationsFor(defaultMenuOptions).length, 2 * 3 * 3 + 2 * 3, 'iced has three ice levels, hot has none');
  const unitOf = (name: string) => name === 'Ice' || name === 'Espresso beans' ? 'g' : name.includes('cups') ? 'each' : 'ml';
  const stockOf = (amounts: Record<string, number>) => stockMap(Object.entries(amounts).map(([name, amount]) => onHand(name, unitOf(name), amount)));
  const plenty = { 'Espresso beans': 18 * 300, 'Pumpkin syrup': 30 * 300, Ice: 150 * 300, 'Hot cups': 300, 'Cold cups': 300 };

  // Only the milk differs, so the answer is given per milk.
  const byMilk = drinkCapacity(latte, defaultMenuOptions, stockOf({ ...plenty, 'Whole milk': 3000, 'Oat milk': 1800 }));
  assert.deepEqual(byMilk.groups.map(g => [g.label, g.drinksLeft, g.limits[0].item]), [['oat milk', 9, 'Oat milk'], ['whole milk', 15, 'Whole milk']]);
  assert.equal(byMilk.drinksLeft, 9);

  // Every choice allows the same: one unlabelled figure.
  const same = drinkCapacity(latte, defaultMenuOptions, stockOf({ ...plenty, 'Espresso beans': 18 * 40, 'Whole milk': 1e6, 'Oat milk': 1e6 }));
  assert.deepEqual(same.groups.map(g => [g.label, g.drinksLeft]), [['', 40]]);

  // Temperature and milk both matter: one figure per type, syrup taken at 100% and ice at full.
  const mixed = drinkCapacity(latte, defaultMenuOptions, stockOf({ ...plenty, 'Whole milk': 20000, 'Oat milk': 3950, 'Pumpkin syrup': 600, 'Cold cups': 3 }));
  assert.deepEqual(mixed.groups.map(g => [g.label, g.drinksLeft]), [['iced, oat milk', 3], ['iced, whole milk', 3], ['hot, oat milk', 19], ['hot, whole milk', 20]]);
  assert.equal(drinkCapacity(latte, defaultMenuOptions, stockMap([onHand('Espresso beans', 'g', -40)])).drinksLeft, 0, 'an overdrawn estimate means none left');
  assert.equal(drinkCapacity(latte, defaultMenuOptions, new Map()).drinksLeft, null);

  const cost = drinkCostRange(latte, defaultMenuOptions, new Map([['Espresso beans', { costPerUnit: 0.02 }], ['Oat milk', { costPerUnit: 0.004 }], ['Pumpkin syrup', { costPerUnit: 0.01 }]]));
  assert.deepEqual([cost.min, cost.max].map(v => Math.round(v * 1000) / 1000), [0.51, 1.46], 'cheapest: whole milk (free here) at 50% syrup; dearest: oat milk at 100%');
});

test('warnings flag each drink type at 20 or fewer, with every ingredient at or under 20', () => {
  const stock = stockMap([
    onHand('Espresso beans', 'g', 18 * 300), onHand('Whole milk', 'ml', 20000), onHand('Oat milk', 'ml', 3950),
    onHand('Pumpkin syrup', 'ml', 600), onHand('Ice', 'g', 150 * 500), onHand('Hot cups', 'each', 500), onHand('Cold cups', 'each', 3),
  ]);
  const recipes = new Map<string, RecipeRef>([['r1', { id: 'r1', name: 'PSL', published: latte }]]);
  const drinks = [{ id: 'm1', name: 'PSL', options: defaultMenuOptions }, { id: 'm2', name: 'PSL hot only', options: { ...defaultMenuOptions, temperatures: ['Hot' as const], milks: ['Whole' as const] } }, { id: 'm3', name: 'Unlinked', options: defaultMenuOptions }];
  const warnings = drinkWarnings(drinks, new Map([['m1', 'r1'], ['m2', 'r1'], ['m3', null]]), recipes, stock);
  assert.deepEqual(warnings.map(w => [w.name, w.drinksLeft]), [['PSL', 3], ['PSL hot only', 20]]);
  assert.deepEqual(warnings[0].groups.map(g => [g.label, g.limits.map(l => l.item)]), [
    ['iced, oat milk', ['Cold cups', 'Oat milk', 'Pumpkin syrup']], ['iced, whole milk', ['Cold cups', 'Pumpkin syrup']],
    ['hot, oat milk', ['Oat milk', 'Pumpkin syrup']], ['hot, whole milk', ['Pumpkin syrup']],
  ]);
  assert.deepEqual(warnings[1].groups.map(g => [g.label, g.limits.map(l => l.item)]), [['', ['Pumpkin syrup']]], 'a hot whole-milk drink is not limited by cold cups or oat milk');
  assert.equal(DRINKS_LEFT_WARNING, 20);
  assert.equal(drinkWarnings(drinks, new Map([['m2', 'r1']]), recipes, stock, 19).length, 0, 'exactly 20 left warns only at the default threshold');
});

test('inventory CSV has one row per purchase option, round-trips, and still reads prototype sheets', () => {
  const milk = item('Whole milk', { category: 'Milk', openAmount: 600, par: 6000, notes: 'gallon jugs, "barista"', packages: [option({ supplier: 'Costco', bagSize: 3785, costPerBag: 4.5, sealedBags: 2 }), option({ supplier: 'Star Market', bagSize: 1893, costPerBag: 3.2, sealedBags: 1 })] });
  const items = [milk, item('=cmd', { unit: 'each' })];
  const csv = inventoryToCsv(items);
  assert(csv.includes("'=cmd"), 'formula-like text is neutralised for spreadsheets');
  assert.equal(csv.trim().split('\r\n').length, 4, 'header, two milk options, one item with no options');
  const back = csvToInventory(csv);
  assert.deepEqual(back.errors, []);
  assert.deepEqual(back.items.sort((a, b) => a.name.localeCompare(b.name)), [...items].sort((a, b) => a.name.localeCompare(b.name)));

  // A prototype sheet: one row per item, "Cost per unit" instead of "Cost per bag", old pack headers.
  const legacy = csvToInventory('Item,Unit,Pack size,Packs,Loose,Qty on hand,Category,Cost per unit,Supplier\nBeans,g,1000,2,250,99999,Coffee,0.022,Roaster\nIce,cups,1,1,1,1,Other,0,\nSalt,g,abc,1,1,1,Topping,0,');
  assert.deepEqual(legacy.items.map(row => [row.name, row.openAmount, row.category, row.packages.map(p => [p.supplier, p.bagSize, p.sealedBags, p.costPerBag])]), [['Beans', 250, 'Coffee', [['Roaster', 1000, 2, 22]]]]);
  assert.equal(legacy.errors.length, 2);
  const duplicate = csvToInventory('Item,Unit,Supplier,Bag size\nMilk,ml,Costco,946\nMilk,ml,costco,946\nOat,ml,A,1\nOat,g,B,1');
  assert.equal(duplicate.items.length, 0, 'a bad row drops its whole ingredient');
  assert.equal(duplicate.errors.length, 2);
  assert.match(csvToInventory('Name,Unit\nx,g').errors[0], /No "Item" column/);
});

test('bundles keep the prototype shape, carry purchase options, and report every skipped row', () => {
  const milk = item('Whole milk', { openAmount: 500, packages: [option({ supplier: 'Costco', bagSize: 3785, costPerBag: 4.5, sealedBags: 2, preferred: true }), option({ supplier: 'Star', bagSize: 1893, costPerBag: 3.2, sealedBags: 1 })] });
  const bundle = buildBundle([milk], [{ name: 'Cart', category: 'Furniture', quantity: 1, status: 'ok', location: '', custodian: '', serial: '', notes: '', lastCheckedAt: '' }], [
    { slug: 'psl', published: latte, draft: { ...latte, name: 'PSL v2' } },
    { slug: 'draft-only', published: null, draft: { ...latte, name: 'Draft only' } },
  ], new Date('2026-11-05T00:00:00Z'));
  assert.equal(bundle.format, 'lattelab-data'); assert.equal(bundle.version, 1);
  const row = bundle.inventory[0];
  assert.equal(Math.round(row.bagSize * row.sealedBags + row.openBag), countedQuantity(milk), 'the prototype formula still gives the total');
  assert.deepEqual([row.supplier, row.bagSize, row.costPerBag], ['Costco', 3785, 4.5]);
  assert.deepEqual(bundle.recipes.map(r => [r.slug, r.name, r.status]), [['psl', 'Pumpkin Spice Latte', 'published'], ['draft-only', 'Draft only', 'draft']]);

  const read = readBundle(JSON.parse(JSON.stringify(bundle)));
  assert(read.ok);
  assert.deepEqual(read.inventory[0], milk, 'portal bundles round-trip every purchase option');
  assert.equal(read.recipes[0].body.ingredients[4].scale, 'ice');

  // Prototype rows: one bag size and a per-unit cost become one purchase option with a cost per bag.
  const prototype = readBundle({ format: 'lattelab-data', version: 1, guidelines: [{}, {}],
    inventory: [{ name: 'Beans', unit: 'g', bagSize: 1000, sealedBags: 1, openBag: 40, par: 0, costPerUnit: 0.022, category: 'Coffee', supplier: 'Roaster', notes: '' }, { name: 'Pumps', unit: 'pump' }, { unit: 'g' }],
    recipes: [{ name: 'Vanilla Latte', category: 'Espresso', status: 'published', ingredients: [{ item: 'Beans', qty: 18, unit: 'g', note: '' }], steps: ['Pull'], notes: '' }, { name: 'Empty', ingredients: [] }],
    equipment: [{ name: 'Gaggia', category: 'Machine', quantity: 1, status: 'broken' }],
  });
  assert(prototype.ok);
  assert.deepEqual(prototype.inventory[0].packages, [{ supplier: 'Roaster', bagSize: 1000, costPerBag: 22, sealedBags: 1, preferred: false }]);
  assert.equal(prototype.inventory[0].openAmount, 40);
  assert.deepEqual(prototype.recipes.map(r => [r.slug, r.body.ingredients[0].when, r.body.ingredients[0].scale]), [['vanilla-latte', 'always', 'fixed']]);
  assert.equal(prototype.equipment.length, 0);
  assert.equal(prototype.skipped.length, 4);
  assert.equal(prototype.guidelines, 2);

  assert.deepEqual(readBundle({ format: 'other' }), { ok: false, error: 'Expected a "lattelab-data" file, got "other".' });
  assert.equal(readBundle({ format: 'lattelab-data', version: 2 }).ok, false);
  assert.equal(readBundle([]).ok, false);
  assert.equal(slugify('Oat milk — barista'), 'oat-milk-barista');
});
