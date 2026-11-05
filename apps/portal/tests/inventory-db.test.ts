import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { buildBundle } from '../lib/inventory';
import { defaultMenuOptions } from '../lib/validations/pos';
import type { RecipeBody } from '../lib/validations/inventory';

// Same safety rules as the POS suite: a disposable loopback database with an exact name, reset by this file.
const testUrl = process.env.POS_TEST_DATABASE_URL;
if (!testUrl) throw new Error('Set POS_TEST_DATABASE_URL to the disposable loopback lattelab_pos_integration database.');
const target = new URL(testUrl);
if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) || target.pathname !== '/lattelab_pos_integration') throw new Error('Integration tests refuse any database except loopback lattelab_pos_integration.');
process.env.DATABASE_URL = testUrl; process.env.DATABASE_SSL = 'disable';
const client = postgres(testUrl, { ssl: false, max: 5 });
let inventory: typeof import('../lib/db/inventory-queries');
let pos: typeof import('../lib/db/pos-queries');
let database: typeof import('../lib/db/index');
const admin = { id: 'pos-test-admin', email: 'pos-admin@example.invalid', isAdmin: true };
// POS and inventory are both admin-only; a signed-in member is refused by both.
const member = { id: 'pos-test-member', email: 'pos-member@example.invalid', isAdmin: false };

before(async () => {
  await client.unsafe('DROP TABLE IF EXISTS inventory_menu_links; DROP TABLE IF EXISTS inventory_item_packages; DROP TABLE IF EXISTS inventory_items; DROP TABLE IF EXISTS inventory_recipes; DROP TABLE IF EXISTS inventory_equipment; DROP TABLE IF EXISTS pos_drink_logs; DROP TABLE IF EXISTS pos_event_menu_items; DROP TABLE IF EXISTS pos_events; DROP TABLE IF EXISTS users;');
  await client.unsafe(`CREATE TABLE users (id text PRIMARY KEY, email text UNIQUE); INSERT INTO users VALUES ('pos-test-admin','pos-admin@example.invalid'),('pos-test-member','pos-member@example.invalid');`);
  const migrations = (await readdir(new URL('../lib/db/migrations/', import.meta.url))).filter(name => name.endsWith('.sql')).sort();
  for (const migration of migrations) await client.unsafe(await readFile(new URL(`../lib/db/migrations/${migration}`, import.meta.url), 'utf8'));
  inventory = await import('../lib/db/inventory-queries'); pos = await import('../lib/db/pos-queries'); database = await import('../lib/db/index');
});
after(async () => { await database?.db.$client.end(); await client.end(); });

const suffix = () => randomUUID().slice(0, 8);
const ingredient = (name: string, unit: 'g' | 'ml' | 'each', bagSize: number, sealedBags: number, costPerBag: number, extra: Partial<{ par: number; openAmount: number; supplier: string }> = {}) =>
  ({ name, category: 'Other' as const, unit, openAmount: extra.openAmount ?? 0, par: extra.par ?? 0, notes: '', packages: [{ supplier: extra.supplier ?? 'Supplier', bagSize, costPerBag, sealedBags, preferred: true }] });
async function setup(drinkName = 'Pumpkin Spice Latte') {
  const s = suffix();
  const beans = await inventory.saveInventoryItem(admin, ingredient(`Beans ${s}`, 'g', 1000, 2, 20, { par: 500 }));
  const oat = await inventory.saveInventoryItem(admin, ingredient(`Oat ${s}`, 'ml', 946, 4, 3.97));
  const whole = await inventory.saveInventoryItem(admin, ingredient(`Whole ${s}`, 'ml', 3785, 1, 4.5));
  const body: RecipeBody = { name: `PSL ${s}`, category: 'Espresso', steps: ['Pull', 'Pour'], notes: '', ingredients: [
    { item: beans.name, qty: 18, unit: 'g', note: '', when: 'always', scale: 'fixed' },
    { item: oat.name, qty: 200, unit: 'ml', note: '', when: 'oat', scale: 'fixed' },
    { item: whole.name, qty: 200, unit: 'ml', note: '', when: 'whole', scale: 'fixed' },
  ] };
  let recipe = await inventory.createRecipe(admin, { name: body.name });
  recipe = await inventory.saveRecipeDraft(admin, { id: recipe.id, expectedVersion: recipe.version, body });
  recipe = await inventory.publishRecipe(admin, { id: recipe.id, expectedVersion: recipe.version });
  const event = await pos.createPosEvent(admin, { name: `Event ${s}`, startsAt: '2026-10-01T10:00', endsAt: '2026-10-01T15:00' });
  const drink = await pos.savePosMenuItem(admin, { eventId: event.id, name: drinkName === 'recipe' ? body.name : drinkName, options: defaultMenuOptions, available: true });
  return { s, beans, oat, whole, recipe, event, drink, body };
}
const log = (eventId: string, drink: { id: string; version: number }, milk: 'Whole' | 'Oat', quantity = 1) =>
  pos.logPosDrinks(admin, { eventId, submissionId: randomUUID(), outsideWindowConfirmed: true, lines: [{ menuItemId: drink.id, menuVersion: drink.version, configuration: { temperature: 'Hot', milk, syrup: 100 }, quantity }] });
const stockOf = async (name: string) => (await inventory.getInventoryStock(admin)).items.find(item => item.name === name)!;
const countAs = async (name: string, sealed: number, openAmount: number) => {
  const item = await stockOf(name);
  return inventory.countInventoryItem(admin, { id: item.id, expectedVersion: item.version, openAmount, packages: item.packages.map(option => ({ id: option.id, sealedBags: sealed })) });
};

test('inventory is admin-only and links accept only published recipes on that event’s menu', async () => {
  const { recipe, event, drink } = await setup(); const other = await setup();
  await assert.rejects(inventory.getInventoryStock(member), /Administrator/);
  await assert.rejects(inventory.getDrinkWarnings(member, event.id), /Administrator/);
  await assert.rejects(inventory.saveMenuLink(member, { eventId: event.id, menuItemId: drink.id, recipe: recipe.id, plannedServings: 1 }), /Administrator/);
  await assert.rejects(inventory.saveMenuLink(admin, { eventId: other.event.id, menuItemId: drink.id, recipe: recipe.id, plannedServings: 1 }), /not on this event/);
  const draft = await inventory.createRecipe(admin, { name: 'Unpublished idea' });
  await assert.rejects(inventory.saveMenuLink(admin, { eventId: event.id, menuItemId: drink.id, recipe: draft.id, plannedServings: 1 }), /Only published/);
  const link = await inventory.saveMenuLink(admin, { eventId: event.id, menuItemId: drink.id, recipe: recipe.id, plannedServings: 40 });
  const off = await inventory.saveMenuLink(admin, { eventId: event.id, menuItemId: drink.id, recipe: 'none', plannedServings: 50 });
  assert.equal(link.menuItemId, off.menuItemId); assert.deepEqual([off.recipeId, off.track, off.plannedServings], [null, false, 50]);
  const auto = await inventory.saveMenuLink(admin, { eventId: event.id, menuItemId: drink.id, recipe: 'auto', plannedServings: 50 });
  assert.deepEqual([auto.recipeId, auto.track], [null, true]);
});

test('a POS drink named like a published recipe deducts stock with no setup; “don’t track” and pins override it', async () => {
  const { beans, oat, recipe, event, drink, body } = await setup('recipe');
  await log(event.id, drink, 'Oat', 2);
  assert.deepEqual([(await stockOf(beans.name)).usedSinceCount, (await stockOf(oat.name)).usedSinceCount], [36, 400], 'no link row was ever written');
  const view = await inventory.getEventInventory(admin, event.id);
  assert.deepEqual([view?.menu[0].source, view?.menu[0].recipeInUse], ['auto', recipe.id]);
  assert.equal((await inventory.listInventoryEvents(admin)).find(e => e.id === event.id)?.linked, 1);

  await inventory.saveMenuLink(admin, { eventId: event.id, menuItemId: drink.id, recipe: 'none', plannedServings: 0 });
  assert.equal((await stockOf(beans.name)).usedSinceCount, 0);
  // Renaming the POS drink away from the recipe breaks the name match, and a pin restores it.
  const [current] = await pos.getPosMenu(admin, event.id);
  const renamed = await pos.savePosMenuItem(admin, { eventId: event.id, id: current.id, expectedVersion: current.version, name: `${body.name} (special)`, options: defaultMenuOptions, available: true });
  await inventory.saveMenuLink(admin, { eventId: event.id, menuItemId: drink.id, recipe: 'auto', plannedServings: 0 });
  assert.equal((await stockOf(beans.name)).usedSinceCount, 0);
  await inventory.saveMenuLink(admin, { eventId: event.id, menuItemId: renamed.id, recipe: recipe.id, plannedServings: 0 });
  assert.equal((await stockOf(beans.name)).usedSinceCount, 36);
});

test('POS logs, voids and corrections flow into stock; a recount resets the baseline', async () => {
  const { beans, oat, whole, recipe, event, drink } = await setup();
  await log(event.id, drink, 'Oat');
  assert.equal((await stockOf(beans.name)).usedSinceCount, 0, 'a drink with no matching or pinned recipe uses nothing');
  await inventory.saveMenuLink(admin, { eventId: event.id, menuItemId: drink.id, recipe: recipe.id, plannedServings: 0 });
  // Linking after service still attributes the drinks recorded since the last count.
  assert.equal((await stockOf(beans.name)).usedSinceCount, 18);
  const [second] = await log(event.id, drink, 'Whole', 2);
  assert.deepEqual([(await stockOf(beans.name)).onHand, (await stockOf(oat.name)).usedSinceCount, (await stockOf(whole.name)).usedSinceCount], [2000 - 54, 200, 400]);

  await pos.correctPosDrinkLog(admin, { logId: second.id, mutationId: randomUUID(), configuration: { temperature: 'Hot', milk: 'Oat', syrup: 100 }, quantity: 1, kerb: null, reason: 'Wrong milk' });
  assert.deepEqual([(await stockOf(beans.name)).usedSinceCount, (await stockOf(oat.name)).usedSinceCount, (await stockOf(whole.name)).usedSinceCount], [36, 400, 0]);
  const [current] = (await pos.getPosLogs(admin, event.id)).filter(entry => entry.replacesLogId === second.id);
  await pos.voidPosDrinkLog(admin, { logId: current.id, reason: 'Accidental entry removed' });
  assert.equal((await stockOf(beans.name)).usedSinceCount, 18);

  const counted = await stockOf(beans.name);
  await assert.rejects(inventory.countInventoryItem(admin, { id: beans.id, expectedVersion: counted.version + 1, openAmount: 400, packages: [] }), /changed/);
  await assert.rejects(inventory.countInventoryItem(admin, { id: beans.id, expectedVersion: counted.version, openAmount: 400, packages: [{ id: (await stockOf(oat.name)).packages[0].id, sealedBags: 1 }] }), /purchase option changed/);
  await countAs(beans.name, 1, 400);
  assert.deepEqual([(await stockOf(beans.name)).counted, (await stockOf(beans.name)).usedSinceCount], [1400, 0]);
  assert.equal((await stockOf(oat.name)).usedSinceCount, 200, 'other items keep their own count time');
  await log(event.id, drink, 'Oat');
  assert.equal((await stockOf(beans.name)).onHand, 1400 - 18);

  // Pulling the recipe from the book stops it counting, exactly like a draft on a prototype event menu.
  const published = (await inventory.listRecipes(admin)).find(r => r.id === recipe.id)!;
  await inventory.unpublishRecipe(admin, { id: recipe.id, expectedVersion: published.version });
  assert.equal((await stockOf(beans.name)).usedSinceCount, 0);
  const view = await inventory.getEventInventory(admin, event.id);
  assert(view); assert.equal(view.menu[0].logged, 2);
});

test('drinks that stock can make 20 or fewer more of are flagged with their limiting ingredients', async () => {
  const { beans, oat, whole, event, drink, recipe } = await setup('recipe');
  // 21 oat drinks' worth (4,200 ml) and plenty of beans and whole milk.
  await inventory.saveMenuLink(admin, { eventId: event.id, menuItemId: drink.id, recipe: recipe.id, plannedServings: 0 });
  await countAs(oat.name, 0, 4200); await countAs(beans.name, 10, 0); await countAs(whole.name, 5, 0);
  assert.deepEqual(await inventory.getDrinkWarnings(admin, event.id), []);
  await log(event.id, drink, 'Oat');
  const [warning] = await inventory.getDrinkWarnings(admin, event.id);
  assert.deepEqual([warning.name, warning.drinksLeft, warning.limits.map(l => [l.item, l.drinksLeft, l.when])], [drink.name, 20, [[oat.name, 20, 'oat']]], 'it warns at 20, before running out');
  assert.equal((await inventory.getEventInventory(admin, event.id))?.warnings.length, 1);
  // Events that have ended are not warned about on the stock page; this test event's window is in the past.
  assert.equal((await inventory.getInventoryStock(admin)).warnings.some(w => w.eventId === event.id), false);
  const [current] = await pos.getPosMenu(admin, event.id);
  await pos.savePosMenuItem(admin, { eventId: event.id, id: current.id, expectedVersion: current.version, name: current.name, options: current.options, available: false });
  assert.deepEqual(await inventory.getDrinkWarnings(admin, event.id), [], 'unavailable drinks are not warned about');
});

test('event plans read the live POS menu, keep removed drinks that sold, and never block POS event deletion', async () => {
  const { recipe, event, drink, beans } = await setup();
  const spare = await pos.savePosMenuItem(admin, { eventId: event.id, name: 'Apple Cider', options: defaultMenuOptions, available: true });
  await inventory.saveMenuLink(admin, { eventId: event.id, menuItemId: drink.id, recipe: recipe.id, plannedServings: 100 });
  await inventory.saveMenuLink(admin, { eventId: event.id, menuItemId: spare.id, recipe: recipe.id, plannedServings: 5 });
  await log(event.id, drink, 'Oat', 3);
  const [latest] = await pos.getPosMenu(admin, event.id);
  await pos.removePosMenuItem(admin, { eventId: event.id, id: latest.id, expectedVersion: latest.version });
  await pos.removePosMenuItem(admin, { eventId: event.id, id: spare.id, expectedVersion: spare.version });
  const view = await inventory.getEventInventory(admin, event.id);
  assert(view);
  assert.deepEqual(view.menu.map(d => [d.name, d.plannedServings, d.logged, !!d.archivedAt]), [['Pumpkin Spice Latte', 100, 3, true]], 'a removed drink with no orders drops out');
  assert.equal((await inventory.listInventoryEvents(admin)).find(e => e.id === event.id)?.planned, 0, 'the list counts only drinks still on the menu');
  assert.equal((await stockOf(beans.name)).usedSinceCount, 54);

  await pos.deletePosEvent(admin, { eventId: event.id, nameConfirmation: event.name });
  assert.equal(await inventory.getEventInventory(admin, event.id), null);
  const [{ count }] = await client`select count(*)::int as count from inventory_menu_links where event_id = ${event.id}`;
  assert.equal(count, 0);
  assert.equal((await stockOf(beans.name)).usedSinceCount, 0, 'deleting an event removes its orders from usage, as it does from analytics');
});

test('purchase options group one ingredient: edits keep ids, move the preferred flag and only recount on a changed total', async () => {
  const s = suffix();
  const milk = await inventory.saveInventoryItem(admin, { name: `Milk ${s}`, category: 'Milk', unit: 'ml', openAmount: 500, par: 0, notes: '', packages: [
    { supplier: 'Costco', bagSize: 3785, costPerBag: 4.5, sealedBags: 2, preferred: true }, { supplier: 'Star Market', bagSize: 1893, costPerBag: 3.2, sealedBags: 1, preferred: false },
  ] });
  const first = await stockOf(milk.name);
  assert.deepEqual([first.counted, first.packages.length], [3785 * 2 + 1893 + 500, 2]);
  const [costco, star] = ['Costco', 'Star Market'].map(supplier => first.packages.find(o => o.supplier === supplier)!);
  assert.deepEqual(first.packages.map(o => o.supplier), ['Costco', 'Star Market'], 'options are listed by supplier, then size');
  // A price change and moving "preferred" is not a new count; adding a third option with stock is.
  const repriced = await inventory.saveInventoryItem(admin, { id: milk.id, expectedVersion: first.version, name: milk.name, category: 'Milk', unit: 'ml', openAmount: 500, par: 0, notes: '', packages: [
    { id: costco.id, supplier: 'Costco', bagSize: 3785, costPerBag: 4.99, sealedBags: 2, preferred: false }, { id: star.id, supplier: 'Star Market', bagSize: 1893, costPerBag: 3.2, sealedBags: 1, preferred: true },
  ] });
  const second = await stockOf(milk.name);
  assert.equal(second.countedAt.getTime(), first.countedAt.getTime());
  assert.deepEqual(second.packages.map(o => [o.id, o.costPerBag, o.preferred]), [[costco.id, 4.99, false], [star.id, 3.2, true]]);
  await inventory.saveInventoryItem(admin, { id: milk.id, expectedVersion: repriced.version, name: milk.name, category: 'Milk', unit: 'ml', openAmount: 500, par: 0, notes: '', packages: [
    { id: star.id, supplier: 'Star Market', bagSize: 1893, costPerBag: 3.2, sealedBags: 1, preferred: true }, { supplier: 'Trader Joe’s', bagSize: 946, costPerBag: 2.5, sealedBags: 3, preferred: false },
  ] });
  const third = await stockOf(milk.name);
  assert.deepEqual(third.packages.map(o => o.supplier), ['Star Market', 'Trader Joe’s'], 'a removed option is deleted, a new one added');
  assert.equal(third.counted, 1893 + 946 * 3 + 500);
  assert(third.countedAt > second.countedAt);
  await assert.rejects(inventory.saveInventoryItem(admin, { id: milk.id, expectedVersion: third.version, name: milk.name, category: 'Milk', unit: 'ml', openAmount: 0, par: 0, notes: '', packages: [{ id: costco.id, supplier: 'Costco', bagSize: 3785, costPerBag: 4.5, sealedBags: 1, preferred: false }] }), /purchase option changed/);
});

test('renaming an item rewrites recipe references, names stay unique, and deletes leave recipes readable', async () => {
  const { beans, recipe, event, drink } = await setup();
  await inventory.saveMenuLink(admin, { eventId: event.id, menuItemId: drink.id, recipe: recipe.id, plannedServings: 0 });
  await log(event.id, drink, 'Oat');
  const current = await stockOf(beans.name);
  const fields = (name: string) => ({ name, category: 'Coffee' as const, unit: 'g' as const, openAmount: 0, par: 500, notes: '', packages: current.packages.map(({ id, supplier, bagSize, costPerBag, sealedBags, preferred }) => ({ id, supplier, bagSize, costPerBag, sealedBags, preferred })) });
  const renamed = await inventory.saveInventoryItem(admin, { id: beans.id, expectedVersion: current.version, ...fields(`${beans.name} (house)`) });
  const [after] = (await inventory.listRecipes(admin)).filter(r => r.id === recipe.id);
  assert.equal(after.published?.ingredients[0].item, renamed.name);
  assert.equal(after.version, recipe.version + 1, 'open recipe editors see the change as a newer version');
  assert.equal((await stockOf(renamed.name)).usedSinceCount, 18, 'usage survives the rename and the count is unchanged');
  await assert.rejects(inventory.saveInventoryItem(admin, { name: renamed.name, category: 'Coffee', unit: 'g', openAmount: 0, par: 0, notes: '', packages: [] }), /already has that name/);
  await assert.rejects(inventory.saveInventoryItem(admin, { id: beans.id, expectedVersion: current.version, ...fields('Stale') }), /changed/);
  await inventory.deleteInventoryItem(admin, { id: beans.id });
  const [{ count }] = await client`select count(*)::int as count from inventory_item_packages where item_id = ${beans.id}`;
  assert.equal(count, 0, 'purchase options go with their item');
  assert.equal((await inventory.getRecipeWithStock(admin, recipe.id))?.recipe.published?.ingredients[0].item, renamed.name);
});

test('bundle import merges by name, supplier/size and slug, keeps the draft/published split and never deletes', async () => {
  const s = suffix();
  const keep = await inventory.saveInventoryItem(admin, { name: `Keep me ${s}`, category: 'Other', unit: 'each', openAmount: 3, par: 0, notes: '', packages: [] });
  const body: RecipeBody = { name: `Mocha ${s}`, category: 'Espresso', steps: [], notes: '', ingredients: [{ item: `Cocoa ${s}`, qty: 15, unit: 'g', note: '', when: 'always', scale: 'fixed' }] };
  // A prototype-shaped row: one bag size and a per-unit cost.
  const file = {
    format: 'lattelab-data', version: 1,
    inventory: [{ name: `Cocoa ${s}`, category: 'Powder', unit: 'g', bagSize: 500, sealedBags: 1, openBag: 20, par: 0, costPerUnit: 0.03, supplier: 'Costco', notes: '' }],
    equipment: [{ name: `Cart ${s}`, category: 'Furniture', quantity: 1, status: 'ok', location: 'Basement', custodian: '', serial: '', notes: '', lastCheckedAt: '2026-09-14' }],
    recipes: buildBundle([], [], [{ slug: `mocha-${s}`, published: body, draft: null }, { slug: `idea-${s}`, published: null, draft: { ...body, name: `Idea ${s}` } }]).recipes,
  };
  const first = await inventory.importBundle(admin, structuredClone(file));
  assert.deepEqual([first.itemsAdded, first.equipmentAdded, first.recipesAdded, first.recipesUpdated], [1, 1, 2, 0]);
  assert.deepEqual((await stockOf(`Cocoa ${s}`)).packages.map(o => [o.supplier, o.bagSize, o.costPerBag]), [['Costco', 500, 15]], 'cost per unit becomes cost per bag');

  // Re-import: the same option updates, a new supplier is added to the same ingredient, the mocha stays published.
  const edited = { ...file, inventory: [{ ...file.inventory[0], packages: [{ supplier: 'costco', bagSize: 500, costPerBag: 16, sealedBags: 4 }, { supplier: 'Star', bagSize: 250, costPerBag: 9, sealedBags: 2 }] }], recipes: [{ ...file.recipes[0], status: 'draft', name: `Mocha ${s} v2` }] };
  const second = await inventory.importBundle(admin, edited);
  assert.deepEqual([second.itemsAdded, second.itemsUpdated, second.recipesAdded, second.recipesUpdated, second.equipmentUpdated], [0, 1, 0, 1, 1]);
  const cocoa = await stockOf(`Cocoa ${s}`);
  assert.deepEqual(cocoa.packages.map(o => [o.supplier, o.bagSize, o.costPerBag, o.sealedBags]), [['Costco', 500, 16, 4], ['Star', 250, 9, 2]]);
  assert.equal(cocoa.counted, 500 * 4 + 250 * 2 + 20);
  const mocha = (await inventory.listRecipes(admin)).find(r => r.slug === `mocha-${s}`)!;
  assert.equal(mocha.published?.name, `Mocha ${s}`); assert.equal(mocha.draft?.name, `Mocha ${s} v2`);
  assert(await stockOf(keep.name), 'records absent from the file are left alone');
  await inventory.importBundle(admin, { ...file, inventory: [{ ...file.inventory[0], packages: [] }] });
  assert.equal((await stockOf(`Cocoa ${s}`)).packages.length, 2, 'an import never deletes purchase options');
  await assert.rejects(inventory.importBundle(admin, { format: 'lattelab-data', version: 1, inventory: [{ name: 'x', unit: 'pump' }] }), /Nothing importable/);
  await assert.rejects(inventory.importBundle(member, file), /Administrator/);
});
