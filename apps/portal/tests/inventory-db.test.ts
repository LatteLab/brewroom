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
process.env.DATABASE_URL = testUrl; process.env.DATABASE_SSL = 'disable'; process.env.POS_STAFF_EMAILS = 'pos-staff@example.invalid';
const client = postgres(testUrl, { ssl: false, max: 5 });
let inventory: typeof import('../lib/db/inventory-queries');
let pos: typeof import('../lib/db/pos-queries');
let database: typeof import('../lib/db/index');
const admin = { id: 'pos-test-admin', email: 'pos-admin@example.invalid', isAdmin: true };
const staff = { id: 'pos-test-staff', email: 'pos-staff@example.invalid', isAdmin: false };

before(async () => {
  await client.unsafe('DROP TABLE IF EXISTS inventory_menu_links; DROP TABLE IF EXISTS inventory_items; DROP TABLE IF EXISTS inventory_recipes; DROP TABLE IF EXISTS inventory_equipment; DROP TABLE IF EXISTS pos_drink_logs; DROP TABLE IF EXISTS pos_event_menu_items; DROP TABLE IF EXISTS pos_events; DROP TABLE IF EXISTS users;');
  await client.unsafe(`CREATE TABLE users (id text PRIMARY KEY, email text UNIQUE); INSERT INTO users VALUES ('pos-test-admin','pos-admin@example.invalid'),('pos-test-staff','pos-staff@example.invalid');`);
  const migrations = (await readdir(new URL('../lib/db/migrations/', import.meta.url))).filter(name => name.endsWith('.sql')).sort();
  for (const migration of migrations) await client.unsafe(await readFile(new URL(`../lib/db/migrations/${migration}`, import.meta.url), 'utf8'));
  inventory = await import('../lib/db/inventory-queries'); pos = await import('../lib/db/pos-queries'); database = await import('../lib/db/index');
});
after(async () => { await database?.db.$client.end(); await client.end(); });

const suffix = () => randomUUID().slice(0, 8);
async function setup() {
  const s = suffix();
  const beans = await inventory.saveInventoryItem(admin, { name: `Beans ${s}`, category: 'Coffee', unit: 'g', bagSize: 1000, sealedBags: 2, openBag: 0, par: 500, costPerUnit: 0.02, supplier: '', notes: '' });
  const oat = await inventory.saveInventoryItem(admin, { name: `Oat ${s}`, category: 'Milk', unit: 'ml', bagSize: 946, sealedBags: 4, openBag: 0, par: 0, costPerUnit: 0.004, supplier: '', notes: '' });
  const whole = await inventory.saveInventoryItem(admin, { name: `Whole ${s}`, category: 'Milk', unit: 'ml', bagSize: 3785, sealedBags: 1, openBag: 0, par: 0, costPerUnit: 0.001, supplier: '', notes: '' });
  const body: RecipeBody = { name: `PSL ${s}`, category: 'Espresso', steps: ['Pull', 'Pour'], notes: '', ingredients: [
    { item: beans.name, qty: 18, unit: 'g', note: '', when: 'always', scale: 'fixed' },
    { item: oat.name, qty: 200, unit: 'ml', note: '', when: 'oat', scale: 'fixed' },
    { item: whole.name, qty: 200, unit: 'ml', note: '', when: 'whole', scale: 'fixed' },
  ] };
  let recipe = await inventory.createRecipe(admin, { name: body.name });
  recipe = await inventory.saveRecipeDraft(admin, { id: recipe.id, expectedVersion: recipe.version, body });
  recipe = await inventory.publishRecipe(admin, { id: recipe.id, expectedVersion: recipe.version });
  const event = await pos.createPosEvent(admin, { name: `Event ${s}`, startsAt: '2026-10-01T10:00', endsAt: '2026-10-01T15:00' });
  const drink = await pos.savePosMenuItem(admin, { eventId: event.id, name: 'Pumpkin Spice Latte', options: defaultMenuOptions, available: true });
  return { beans, oat, whole, recipe, event, drink, body };
}
const log = (eventId: string, drink: { id: string; version: number }, milk: 'Whole' | 'Oat', quantity = 1) =>
  pos.logPosDrinks(staff, { eventId, submissionId: randomUUID(), outsideWindowConfirmed: true, lines: [{ menuItemId: drink.id, menuVersion: drink.version, configuration: { temperature: 'Hot', milk, syrup: 100 }, quantity }] });
const stockOf = async (name: string) => (await inventory.getInventoryStock(admin)).find(item => item.name === name)!;

test('inventory is admin-only and links accept only published recipes on that event’s menu', async () => {
  const { recipe, event, drink } = await setup(); const other = await setup();
  await assert.rejects(inventory.getInventoryStock(staff), /Administrator/);
  await assert.rejects(inventory.saveMenuLink(staff, { eventId: event.id, menuItemId: drink.id, recipeId: recipe.id, plannedServings: 1 }), /Administrator/);
  await assert.rejects(inventory.saveMenuLink(admin, { eventId: other.event.id, menuItemId: drink.id, recipeId: recipe.id, plannedServings: 1 }), /not on this event/);
  const draft = await inventory.createRecipe(admin, { name: 'Unpublished idea' });
  await assert.rejects(inventory.saveMenuLink(admin, { eventId: event.id, menuItemId: drink.id, recipeId: draft.id, plannedServings: 1 }), /Only published/);
  const link = await inventory.saveMenuLink(admin, { eventId: event.id, menuItemId: drink.id, recipeId: recipe.id, plannedServings: 40 });
  const again = await inventory.saveMenuLink(admin, { eventId: event.id, menuItemId: drink.id, recipeId: null, plannedServings: 50 });
  assert.equal(link.menuItemId, again.menuItemId); assert.equal(again.recipeId, null); assert.equal(again.plannedServings, 50);
});

test('POS logs, voids and corrections flow into stock estimates; a recount resets the baseline', async () => {
  const { beans, oat, whole, recipe, event, drink } = await setup();
  await log(event.id, drink, 'Oat');
  assert.equal((await stockOf(beans.name)).usedSinceCount, 0, 'unlinked drinks use nothing');
  await inventory.saveMenuLink(admin, { eventId: event.id, menuItemId: drink.id, recipeId: recipe.id, plannedServings: 0 });
  // Linking after service still attributes the drinks recorded since the last count.
  assert.equal((await stockOf(beans.name)).usedSinceCount, 18);
  const [second] = await log(event.id, drink, 'Whole', 2);
  assert.deepEqual([(await stockOf(beans.name)).onHand, (await stockOf(oat.name)).usedSinceCount, (await stockOf(whole.name)).usedSinceCount], [2000 - 54, 200, 400]);

  await pos.correctPosDrinkLog(staff, { logId: second.id, mutationId: randomUUID(), configuration: { temperature: 'Hot', milk: 'Oat', syrup: 100 }, quantity: 1, kerb: null, reason: 'Wrong milk' });
  assert.deepEqual([(await stockOf(beans.name)).usedSinceCount, (await stockOf(oat.name)).usedSinceCount, (await stockOf(whole.name)).usedSinceCount], [36, 400, 0]);
  const [current] = (await pos.getPosLogs(admin, event.id)).filter(entry => entry.replacesLogId === second.id);
  await pos.voidPosDrinkLog(staff, { logId: current.id, reason: 'Accidental entry removed' });
  assert.equal((await stockOf(beans.name)).usedSinceCount, 18);

  const counted = await stockOf(beans.name);
  await assert.rejects(inventory.countInventoryItem(admin, { id: beans.id, expectedVersion: counted.version + 1, sealedBags: 1, openBag: 400 }), /changed/);
  await inventory.countInventoryItem(admin, { id: beans.id, expectedVersion: counted.version, sealedBags: 1, openBag: 400 });
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

test('event plans read the live POS menu, keep removed drinks that sold, and never block POS event deletion', async () => {
  const { recipe, event, drink, beans } = await setup();
  const spare = await pos.savePosMenuItem(admin, { eventId: event.id, name: 'Apple Cider', options: defaultMenuOptions, available: true });
  await inventory.saveMenuLink(admin, { eventId: event.id, menuItemId: drink.id, recipeId: recipe.id, plannedServings: 100 });
  await inventory.saveMenuLink(admin, { eventId: event.id, menuItemId: spare.id, recipeId: recipe.id, plannedServings: 5 });
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

test('renaming an item rewrites recipe references, names stay unique, and deletes leave recipes readable', async () => {
  const { beans, recipe, event, drink } = await setup();
  await inventory.saveMenuLink(admin, { eventId: event.id, menuItemId: drink.id, recipeId: recipe.id, plannedServings: 0 });
  await log(event.id, drink, 'Oat');
  const renamed = await inventory.saveInventoryItem(admin, { id: beans.id, expectedVersion: beans.version, name: `${beans.name} (house)`, category: 'Coffee', unit: 'g', bagSize: 1000, sealedBags: 2, openBag: 0, par: 500, costPerUnit: 0.02, supplier: 'Roaster', notes: '' });
  const [after] = (await inventory.listRecipes(admin)).filter(r => r.id === recipe.id);
  assert.equal(after.published?.ingredients[0].item, renamed.name);
  assert.equal(after.version, recipe.version + 1, 'open recipe editors see the change as a newer version');
  assert.equal((await stockOf(renamed.name)).usedSinceCount, 18, 'usage survives the rename and the count is unchanged');
  await assert.rejects(inventory.saveInventoryItem(admin, { name: renamed.name, category: 'Coffee', unit: 'g', bagSize: 0, sealedBags: 0, openBag: 0, par: 0, costPerUnit: 0, supplier: '', notes: '' }), /already has that name/);
  await assert.rejects(inventory.saveInventoryItem(admin, { id: beans.id, expectedVersion: beans.version, name: 'Stale', category: 'Coffee', unit: 'g', bagSize: 0, sealedBags: 0, openBag: 0, par: 0, costPerUnit: 0, supplier: '', notes: '' }), /changed/);
  await inventory.deleteInventoryItem(admin, { id: beans.id });
  assert.equal((await inventory.getRecipeWithStock(admin, recipe.id))?.recipe.published?.ingredients[0].item, renamed.name);
});

test('bundle import merges by name and slug, keeps the draft/published split and never deletes', async () => {
  const s = suffix();
  const keep = await inventory.saveInventoryItem(admin, { name: `Keep me ${s}`, category: 'Other', unit: 'each', bagSize: 0, sealedBags: 3, openBag: 0, par: 0, costPerUnit: 0, supplier: '', notes: '' });
  const body: RecipeBody = { name: `Mocha ${s}`, category: 'Espresso', steps: [], notes: '', ingredients: [{ item: `Cocoa ${s}`, qty: 15, unit: 'g', note: '', when: 'always', scale: 'fixed' }] };
  const file = buildBundle(
    [{ name: `Cocoa ${s}`, category: 'Powder', unit: 'g', bagSize: 500, sealedBags: 1, openBag: 20, par: 0, costPerUnit: 0.03, supplier: '', notes: '' }],
    [{ name: `Cart ${s}`, category: 'Furniture', quantity: 1, status: 'ok', location: 'Basement', custodian: '', serial: '', notes: '', lastCheckedAt: '2026-09-14' }],
    [{ slug: `mocha-${s}`, published: body, draft: null }, { slug: `idea-${s}`, published: null, draft: { ...body, name: `Idea ${s}` } }],
  );
  const first = await inventory.importBundle(admin, JSON.parse(JSON.stringify(file)));
  assert.deepEqual([first.itemsAdded, first.equipmentAdded, first.recipesAdded, first.recipesUpdated], [1, 1, 2, 0]);

  // Re-importing the mocha as a draft must not unpublish it; the cocoa count changes and is a new count.
  const edited = { ...file, inventory: [{ ...file.inventory[0], sealedBags: 4 }], recipes: [{ ...file.recipes[0], status: 'draft', name: `Mocha ${s} v2` }] };
  const second = await inventory.importBundle(admin, edited);
  assert.deepEqual([second.itemsAdded, second.itemsUpdated, second.recipesAdded, second.recipesUpdated, second.equipmentUpdated], [0, 1, 0, 1, 1]);
  const mocha = (await inventory.listRecipes(admin)).find(r => r.slug === `mocha-${s}`)!;
  assert.equal(mocha.published?.name, `Mocha ${s}`); assert.equal(mocha.draft?.name, `Mocha ${s} v2`);
  assert.equal((await stockOf(`Cocoa ${s}`)).counted, 2020);
  assert(await stockOf(keep.name), 'records absent from the file are left alone');
  await assert.rejects(inventory.importBundle(admin, { format: 'lattelab-data', version: 1, inventory: [{ name: 'x', unit: 'pump' }] }), /Nothing importable/);
  await assert.rejects(inventory.importBundle(staff, file), /Administrator/);
});
