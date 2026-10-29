import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { defaultMenuOptions } from '../lib/validations/pos';
import { buildAnalytics, logsCsv } from '../lib/pos';

const testUrl = process.env.POS_TEST_DATABASE_URL;
if (!testUrl) throw new Error('Set POS_TEST_DATABASE_URL to the disposable loopback lattelab_pos_integration database.');
const target = new URL(testUrl);
if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) || target.pathname !== '/lattelab_pos_integration') throw new Error('Integration tests refuse any database except loopback lattelab_pos_integration.');
process.env.DATABASE_URL = testUrl; process.env.DATABASE_SSL = 'disable'; process.env.POS_STAFF_EMAILS = 'pos-staff@example.invalid';
const client = postgres(testUrl, { ssl: false, max: 5 });
let queries: typeof import('../lib/db/pos-queries');
let database: typeof import('../lib/db/index');
const admin = { id: 'pos-test-admin', email: 'pos-admin@example.invalid', isAdmin: true };
const staff = { id: 'pos-test-staff', email: 'pos-staff@example.invalid', isAdmin: false };
const outsider = { id: 'outsider', email: 'no-access@example.invalid', isAdmin: false };

before(async () => {
  await client.unsafe('DROP TABLE IF EXISTS pos_drink_logs; DROP TABLE IF EXISTS pos_event_menu_items; DROP TABLE IF EXISTS pos_events; DROP TABLE IF EXISTS users;');
  await client.unsafe(`CREATE TABLE users (id text PRIMARY KEY, email text UNIQUE); INSERT INTO users VALUES ('pos-test-admin','pos-admin@example.invalid'),('pos-test-staff','pos-staff@example.invalid');`);
  const migrations = (await readdir(new URL('../lib/db/migrations/', import.meta.url))).filter(name => name.endsWith('.sql')).sort();
  assert(migrations.length); for (const migration of migrations) await client.unsafe(await readFile(new URL(`../lib/db/migrations/${migration}`, import.meta.url), 'utf8'));
  queries = await import('../lib/db/pos-queries'); database = await import('../lib/db/index');
});
after(async () => { await database?.db.$client.end(); await client.end(); });
async function fixture() {
  const event = await queries.createPosEvent(admin, { name: 'Test event', startsAt: '2026-10-01T10:00', endsAt: '2026-10-01T15:00' });
  for (const name of ['Pumpkin Spice Latte', 'Apple Cider Latte']) await queries.savePosMenuItem(admin, { eventId: event.id, name, options: defaultMenuOptions, available: true });
  const menu = await queries.getPosMenu(admin, event.id); const item = menu[0];
  return { event, menu, item, input: { eventId: event.id, submissionId: randomUUID(), lines: [{ menuItemId: item.id, menuVersion: item.version, configuration: defaultMenuOptions.defaults, quantity: 2 }], outsideWindowConfirmed: true } };
}
test('new POS events start with an empty menu', async () => {
  const event = await queries.createPosEvent(admin, { name: 'Empty menu event', startsAt: '2026-10-01T10:00', endsAt: '2026-10-01T15:00' });
  assert.deepEqual(await queries.getPosMenu(admin, event.id), []);
});
test('removing a menu drink hides it, preserves orders, and rejects stale editors and new orders', async () => {
  const { event, item, menu, input } = await fixture(); const other = await fixture();
  const [log] = await queries.logPosDrinks(staff, input);
  const request = { eventId: event.id, id: item.id, expectedVersion: item.version };
  await assert.rejects(queries.removePosMenuItem(staff, request), /Administrator/);
  await assert.rejects(queries.removePosMenuItem(admin, { ...request, eventId: other.event.id }), /not found in this event/);
  const edited = await queries.savePosMenuItem(admin, { eventId: event.id, id: item.id, expectedVersion: item.version, name: 'Updated drink', options: item.options, available: false });
  await assert.rejects(queries.removePosMenuItem(admin, request), /menu changed/);
  assert.equal((await queries.getPosMenu(admin, event.id)).length, 2);
  const current = { ...request, expectedVersion: edited.version };
  const before = await queries.getPosOverview(admin);
  await queries.removePosMenuItem(admin, current); await queries.removePosMenuItem(admin, current);
  assert.deepEqual((await queries.getPosMenu(staff, event.id)).map(drink => drink.id), [menu[1].id]);
  assert.equal((await queries.getPosReport(admin, event.id))[0].drinkName, item.name);
  assert.equal((await queries.logPosDrinks(staff, input))[0].id, log.id);
  await assert.rejects(queries.logPosDrinks(staff, { ...input, submissionId: randomUUID() }), /no longer available/);
  await assert.rejects(queries.savePosMenuItem(admin, { eventId: event.id, id: item.id, expectedVersion: edited.version + 1, name: 'Restore by stale form', options: item.options, available: true }), /menu changed/);
  await assert.rejects(queries.reorderPosMenu(admin, { eventId: event.id, itemIds: menu.map(drink => drink.id), expectedItemIds: menu.map(drink => drink.id) }), /menu changed/);
  const corrected = await queries.correctPosDrinkLog(staff, { logId: log.id, mutationId: randomUUID(), configuration: log.configuration, quantity: log.quantity, kerb: 'corrected', reason: 'Fix kerb' });
  assert.equal(corrected.quantity, log.quantity);
  const after = await queries.getPosOverview(admin);
  assert.equal(after.totalDrinks, before.totalDrinks); assert.equal(after.totalOrders, before.totalOrders);
  await queries.removePosMenuItem(admin, { eventId: event.id, id: menu[1].id, expectedVersion: menu[1].version });
  assert.deepEqual(await queries.getPosMenu(admin, event.id), []);
  await queries.deletePosEvent(admin, { eventId: event.id, nameConfirmation: event.name });
  assert.equal(await queries.getPosEvent(admin, event.id), null);
});
test('menu removal racing an order either records once before removal or rejects it', async () => {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { event, item, input } = await fixture();
    const results = await Promise.allSettled([
      queries.removePosMenuItem(admin, { eventId: event.id, id: item.id, expectedVersion: item.version }),
      queries.logPosDrinks(staff, input),
    ]);
    assert.equal(results[0].status, 'fulfilled');
    const logs = await queries.getPosReport(admin, event.id);
    if (results[1].status === 'fulfilled') assert.equal(logs.length, 1);
    else { assert.match(String(results[1].reason), /no longer available/); assert.equal(logs.length, 0); }
    assert(!(await queries.getPosMenu(admin, event.id)).some(drink => drink.id === item.id));
    await assert.rejects(queries.logPosDrinks(staff, { ...input, submissionId: randomUUID() }), /no longer available/);
  }
});
test('removal clears kerbs, preserves valid orders and retry identity, and also clears correction history', async () => {
  const { event, input } = await fixture();
  const request = { ...input, kerb: 'originalkerb' };
  const [original] = await queries.logPosDrinks(staff, request);
  const [untouched] = await queries.logPosDrinks(staff, { ...input, submissionId: randomUUID(), kerb: 'validkerb' });
  const correction = { logId: original.id, mutationId: randomUUID(), configuration: original.configuration, quantity: original.quantity, kerb: 'correctedkerb', reason: 'Fix kerb' };
  const replacement = await queries.correctPosDrinkLog(staff, correction);
  let history = await queries.getPosLogs(admin, event.id, true);
  assert.equal(history.find(log => log.id === original.id)?.kerb, null);
  assert.equal(history.find(log => log.id === replacement.id)?.kerb, 'correctedkerb');
  await assert.rejects(queries.voidPosDrinkLog({ ...staff, id: 'another-staff' }, { logId: replacement.id, reason: 'Accidental entry removed' }), /only your own/);
  await queries.voidPosDrinkLog(staff, { logId: replacement.id, reason: 'Accidental entry removed' });
  await queries.voidPosDrinkLog(staff, { logId: replacement.id, reason: 'Accidental entry removed' });
  history = await queries.getPosLogs(admin, event.id, true);
  assert(history.filter(log => log.voidedAt).every(log => log.kerb === null));
  assert.equal(history.find(log => log.id === untouched.id)?.kerb, 'validkerb');
  assert.equal((await queries.logPosDrinks(staff, request))[0].id, original.id);
  assert.equal((await queries.correctPosDrinkLog(staff, correction)).kerb, null);
  assert.deepEqual((await queries.getPosReport(admin, event.id)).map(log => log.id), [untouched.id]);
});
test('the cleanup migration clears existing voided kerbs without changing valid kerbs or totals', async () => {
  const { event, input } = await fixture();
  const [removed] = await queries.logPosDrinks(staff, { ...input, kerb: 'legacyremoved' });
  const [valid] = await queries.logPosDrinks(staff, { ...input, submissionId: randomUUID(), kerb: 'keepvalid' });
  await client`UPDATE pos_drink_logs SET voided_at=now(), voided_by=${staff.id}, void_reason='Accidental entry removed' WHERE id=${removed.id}`;
  const migration = await readFile(new URL('../lib/db/migrations/20261029225111_pos_removed_log_kerbs.sql', import.meta.url), 'utf8');
  const before = await queries.getPosOverview(admin);
  await client.unsafe(migration); await client.unsafe(migration);
  const history = await queries.getPosLogs(admin, event.id, true);
  assert.equal(history.find(log => log.id === removed.id)?.kerb, null);
  assert.equal(history.find(log => log.id === valid.id)?.kerb, 'keepvalid');
  const after = await queries.getPosOverview(admin);
  assert.equal(after.totalDrinks, before.totalDrinks); assert.equal(after.totalOrders, before.totalOrders);
});
test('overview combines valid drinks and counts orders separately for each event', async () => {
  await assert.rejects(queries.getPosOverview(staff), /Administrator/);
  const before = await queries.getPosOverview(admin);
  const a = await fixture(); const b = await fixture();
  const sharedSubmission = randomUUID();
  const [original] = await queries.logPosDrinks(staff, { ...a.input, submissionId: sharedSubmission, lines: [...a.input.lines, { ...a.input.lines[0], menuItemId: a.menu[1].id, quantity: 1 }] });
  await queries.correctPosDrinkLog(staff, { logId: original.id, mutationId: randomUUID(), configuration: { temperature: 'Hot', milk: 'Oat', syrup: 75 }, quantity: 3, reason: 'Correction' });
  await queries.logPosDrinks(staff, { ...b.input, submissionId: sharedSubmission });
  const [voided] = await queries.logPosDrinks(staff, { ...b.input, submissionId: randomUUID() });
  await queries.voidPosDrinkLog(staff, { logId: voided.id, reason: 'Duplicate' });
  const empty = await queries.createPosEvent(admin, { name: 'No orders', startsAt: '2026-10-01T10:00', endsAt: '2026-10-01T15:00' });
  const report = await queries.getPosOverview(admin);
  assert.equal(report.totalDrinks - before.totalDrinks, 6);
  assert.equal(report.totalOrders - before.totalOrders, 2);
  assert.equal(report.drinksPerOrder, report.totalDrinks / report.totalOrders);
  assert.equal(report.events.find(event => event.id === a.event.id)?.totalDrinks, 4);
  assert.equal(report.events.find(event => event.id === a.event.id)?.totalOrders, 1);
  assert.equal(report.events.find(event => event.id === b.event.id)?.totalDrinks, 2);
  assert.equal(report.events.find(event => event.id === empty.id)?.totalOrders, 0);
  const drinkCount = (rows: typeof report.drinks, name: string) => rows.find(drink => drink.name === name)?.count ?? 0;
  assert.equal(drinkCount(report.drinks, a.item.name) - drinkCount(before.drinks, a.item.name), 5);
  assert.equal((report.breakdowns.Milk.Oat ?? 0) - (before.breakdowns.Milk.Oat ?? 0), 3);
  assert.equal((report.breakdowns.Ice['Not applicable (hot)'] ?? 0) - (before.breakdowns.Ice['Not applicable (hot)'] ?? 0), 3);
});
test('deletion requires an admin and current name, removes all history atomically and permits retries', async () => {
  const { event, input } = await fixture(); const other = await fixture();
  const [log] = await queries.logPosDrinks(staff, input);
  const replacement = await queries.correctPosDrinkLog(staff, { logId: log.id, mutationId: randomUUID(), configuration: log.configuration, quantity: 3, reason: 'Correction' });
  await queries.correctPosDrinkLog(staff, { logId: replacement.id, mutationId: randomUUID(), configuration: log.configuration, quantity: 4, reason: 'Correction again' });
  await assert.rejects(queries.deletePosEvent(staff, { eventId: event.id, nameConfirmation: event.name }), /Administrator/);
  await queries.updatePosEvent(admin, event.id, { name: 'Renamed event', startsAt: '2026-10-01T10:00', endsAt: '2026-10-01T15:00' });
  await assert.rejects(queries.deletePosEvent(admin, { eventId: event.id, nameConfirmation: event.name }), /current event name/);
  assert.equal((await queries.getPosLogs(admin, event.id, true)).length, 3);
  const before = await queries.getPosOverview(admin);
  const request = { eventId: event.id, nameConfirmation: 'Renamed event' };
  await queries.deletePosEvent(admin, request); await queries.deletePosEvent(admin, request);
  assert.equal(await queries.getPosEvent(admin, event.id), null);
  assert.deepEqual(await queries.getPosMenu(admin, event.id), []);
  assert.deepEqual(await queries.getPosLogs(admin, event.id, true), []);
  assert(await queries.getPosEvent(admin, other.event.id));
  const after = await queries.getPosOverview(admin);
  assert.equal(before.totalDrinks - after.totalDrinks, 4);
  assert.equal(before.totalOrders - after.totalOrders, 1);
});
test('concurrent deletion and order mutations leave no partial event or history', async () => {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { event, input } = await fixture(); const [log] = await queries.logPosDrinks(staff, input);
    const results = await Promise.allSettled([
      queries.deletePosEvent(admin, { eventId: event.id, nameConfirmation: event.name }),
      queries.logPosDrinks(staff, { ...input, submissionId: randomUUID() }),
      queries.correctPosDrinkLog(staff, { logId: log.id, mutationId: randomUUID(), configuration: log.configuration, quantity: 3, reason: 'Correction' }),
      queries.voidPosDrinkLog(staff, { logId: log.id, reason: 'Void' }),
    ]);
    assert.equal(results[0].status, 'fulfilled');
    for (const result of results.slice(1)) if (result.status === 'rejected') assert.match(String(result.reason), /Event not found|Entry not found|already changed/);
    assert.equal(await queries.getPosEvent(admin, event.id), null);
    assert.deepEqual(await queries.getPosMenu(admin, event.id), []);
    assert.deepEqual(await queries.getPosLogs(admin, event.id, true), []);
  }
});
test('authorization is enforced for setup, logging, reports and ownership', async () => {
  const { event, input } = await fixture();
  await assert.rejects(queries.createPosEvent(staff, { name: 'No' }), /Administrator/);
  await assert.rejects(queries.logPosDrinks(outsider, input), /POS access/);
  await assert.rejects(queries.getPosReport(staff, event.id), /Administrator/);
  const [log] = await queries.logPosDrinks(admin, input);
  await assert.rejects(queries.voidPosDrinkLog(staff, { logId: log.id, reason: 'not mine' }), /only your own/);
  assert.equal((await queries.getPosLogs(staff, event.id, true)).length, 0);
});
test('concurrent retries save once, preserve receipt time and reject payload reuse', async () => {
  const { event, item, input } = await fixture();
  const [first, second] = await Promise.all([queries.logPosDrinks(staff, input), queries.logPosDrinks(staff, input)]);
  assert.equal(first[0].id, second[0].id); assert.equal(first[0].recordedAt.toISOString(), second[0].recordedAt.toISOString());
  assert.equal((await queries.getPosLogs(admin, event.id)).length, 1);
  await assert.rejects(queries.logPosDrinks(staff, { ...input, lines: [{ ...input.lines[0], quantity: 3 }] }), /different order/);
  await queries.savePosMenuItem(admin, { eventId: event.id, id: item.id, expectedVersion: item.version, name: 'Renamed', options: item.options, available: false });
  assert.equal((await queries.logPosDrinks(staff, input))[0].id, first[0].id);
  await assert.rejects(queries.logPosDrinks(staff, { ...input, submissionId: randomUUID() }), /no longer available/);
  assert.equal((await queries.getPosLogs(admin, event.id))[0].drinkName, item.name);
});
test('invalid batches and cross-event menu choices never partially save', async () => {
  const a = await fixture(); const b = await fixture();
  await assert.rejects(queries.logPosDrinks(staff, { ...a.input, lines: [...a.input.lines, { ...a.input.lines[0], menuItemId: b.item.id }] }), /no longer available/);
  assert.equal((await queries.getPosLogs(admin, a.event.id)).length, 0);
  await assert.rejects(queries.logPosDrinks(staff, { ...a.input, lines: [{ ...a.input.lines[0], quantity: 0 }] }));
  await assert.rejects(queries.logPosDrinks(staff, { ...a.input, outsideWindowConfirmed: false }), /outside its scheduled/);
});
test('corrections preserve order time/count, audit history and canonical retry identity', async () => {
  const { event, input } = await fixture(); const [original] = await queries.logPosDrinks(staff, input);
  const change = { logId: original.id, mutationId: randomUUID(), configuration: { temperature: 'Hot', milk: 'Oat', syrup: 75 }, quantity: 3, reason: 'Milk correction' };
  const replacement = await queries.correctPosDrinkLog(staff, change);
  const retry = await queries.correctPosDrinkLog(staff, { ...change, kerb: null }); assert.equal(retry.id, replacement.id);
  assert.equal(replacement.recordedAt.toISOString(), original.recordedAt.toISOString()); assert.equal(replacement.submissionId, original.submissionId);
  const logs = await queries.getPosReport(admin, event.id); const report = buildAnalytics(logs, event, 15);
  assert.equal(report.totalDrinks, 3); assert.equal(report.totalOrders, 1); assert.equal((await queries.getPosLogs(admin, event.id, true)).length, 2);
  assert(logsCsv(logs).includes('"3"')); assert(logsCsv(logs).includes('"Hot"'));
  await assert.rejects(queries.correctPosDrinkLog(staff, { ...change, quantity: 4 }), /different change/);
  assert.equal((await queries.logPosDrinks(staff, input))[0].id, original.id);
  await queries.voidPosDrinkLog(staff, { logId: replacement.id, reason: 'Duplicate entry' });
  await queries.voidPosDrinkLog(staff, { logId: replacement.id, reason: 'Duplicate entry' });
  assert.equal((await queries.getPosReport(admin, event.id)).length, 0);
});
test('two simultaneous corrections create one valid replacement', async () => {
  const { event, input } = await fixture(); const [log] = await queries.logPosDrinks(staff, input);
  const changes = [3, 4].map(quantity => ({ logId: log.id, mutationId: randomUUID(), configuration: log.configuration, quantity, kerb: '', reason: 'Correction' }));
  const results = await Promise.allSettled(changes.map(value => queries.correctPosDrinkLog(staff, value)));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1); assert.equal((await queries.getPosReport(admin, event.id)).length, 1);
});
test('database enforces positive quantities, complete void metadata, event FK and private RLS', async () => {
  const { event, input } = await fixture(); const [log] = await queries.logPosDrinks(staff, input);
  await assert.rejects(client`UPDATE pos_drink_logs SET quantity=0 WHERE id=${log.id}`);
  await assert.rejects(client`UPDATE pos_drink_logs SET voided_at=now(), voided_by=${admin.id} WHERE id=${log.id}`);
  const other = await fixture(); await assert.rejects(client`UPDATE pos_drink_logs SET menu_item_id=${other.item.id} WHERE id=${log.id}`);
  await assert.rejects(client`DELETE FROM pos_events WHERE id=${event.id}`);
  const rows = await client`SELECT relrowsecurity FROM pg_class WHERE relname IN ('pos_events','pos_event_menu_items','pos_drink_logs')`;
  assert.equal(rows.length, 3); assert(rows.every(row => row.relrowsecurity));
  for (const role of ['anon', 'authenticated']) {
    const [exists] = await client`SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=${role}) AS value`;
    if (exists.value) await assert.rejects(client.begin(async tx => { await tx.unsafe(`SET LOCAL ROLE ${role}`); await tx`SELECT * FROM pos_drink_logs`; }));
  }
});

test('stale menu edits/logs fail and restricted options still permit unchanged historical corrections', async () => {
  const { event, item, input } = await fixture();
  const [original] = await queries.logPosDrinks(staff, { ...input, lines: [{ ...input.lines[0], configuration: { temperature: 'Iced', milk: 'Oat', syrup: 100, ice: 'Full' } }] });
  const restricted = { ...item.options, milks: ['Whole'] };
  await queries.savePosMenuItem(admin, { eventId: event.id, id: item.id, expectedVersion: item.version, name: item.name, options: restricted, available: true });
  await assert.rejects(queries.savePosMenuItem(admin, { eventId: event.id, id: item.id, expectedVersion: item.version, name: 'Stale edit', options: item.options, available: true }), /menu changed/);
  await assert.rejects(queries.logPosDrinks(staff, { ...input, submissionId: randomUUID() }), /menu changed/);
  const correction = { logId: original.id, mutationId: randomUUID(), quantity: 4, configuration: original.configuration, reason: 'Quantity only' };
  const [a, b] = await Promise.all([queries.correctPosDrinkLog(staff, correction), queries.correctPosDrinkLog(staff, correction)]);
  assert.equal(a.id, b.id); assert.equal(a.recordedAt.toISOString(), original.recordedAt.toISOString());
  await assert.rejects(queries.correctPosDrinkLog(staff, { ...correction, logId: a.id, mutationId: randomUUID(), configuration: { temperature: 'Hot', milk: 'Oat', syrup: 75 } }), /not supported/);
});
test('menu reordering persists atomically, rejects stale/cross-event lists and keeps logging versions', async () => {
  const { event, menu, input } = await fixture(); const other = await fixture();
  const expectedItemIds = menu.map(item => item.id); const itemIds = [...expectedItemIds].reverse();
  const request = { eventId: event.id, itemIds, expectedItemIds };
  await assert.rejects(queries.reorderPosMenu(staff, request), /Administrator/);
  await assert.rejects(queries.reorderPosMenu(admin, { ...request, itemIds: [menu[0].id, menu[0].id] }), /exactly once/);
  await assert.rejects(queries.reorderPosMenu(admin, { ...request, itemIds: [menu[0].id, other.item.id] }), /menu changed/);
  await assert.rejects(queries.reorderPosMenu(admin, { ...request, itemIds: [menu[0].id] }), /menu changed/);
  assert.deepEqual((await queries.getPosMenu(admin, event.id)).map(item => item.id), expectedItemIds);
  await queries.reorderPosMenu(admin, request);
  await queries.reorderPosMenu(admin, request);
  const reordered = await queries.getPosMenu(admin, event.id);
  assert.deepEqual(reordered.map(item => item.id), itemIds);
  assert.deepEqual(reordered.map(item => item.sortOrder), [0, 1]);
  assert(reordered.every(item => item.version === 1));
  await queries.logPosDrinks(staff, input);
  await assert.rejects(queries.reorderPosMenu(admin, { ...request, itemIds: expectedItemIds }), /order changed/);
  const added = await queries.savePosMenuItem(admin, { eventId: event.id, name: 'New drink', options: defaultMenuOptions, available: true });
  assert.equal(added.sortOrder, 2);
  await assert.rejects(queries.reorderPosMenu(admin, { ...request, itemIds: expectedItemIds }), /menu changed/);
  const saved = await queries.savePosMenuItem(admin, { eventId: event.id, id: added.id, expectedVersion: added.version, name: 'Renamed new drink', options: added.options, available: true });
  assert.equal(saved.sortOrder, 2);
});
