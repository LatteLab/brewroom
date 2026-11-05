import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { configurationSchema, defaultMenuOptions, menuOptionsSchema, logInputSchema, quantitySchema, singleDrinkInputSchema } from '../lib/validations/pos';
import { easternInstant, easternInput, assertPosAdmin, buildAnalytics, logsCsv, type AnalyticsLog } from '../lib/pos';

test('Eastern date entry respects summer/winter and rejects DST gaps/repeats', () => {
  assert.equal(easternInstant('2026-07-15T15:00').toISOString(), '2026-07-15T19:00:00.000Z');
  assert.equal(easternInstant('2026-12-15T15:00').toISOString(), '2026-12-15T20:00:00.000Z');
  assert.equal(easternInput('2026-07-15T19:00:00Z'), '2026-07-15T15:00');
  assert.throws(() => easternInstant('2026-03-08T02:30'), /daylight saving/);
  assert.throws(() => easternInstant('2026-11-01T01:30'), /daylight saving/);
  assert.throws(() => easternInstant('2026-02-30T12:00'), /daylight saving/);
});
test('hot drinks cannot carry ice and menu defaults must be available', () => {
  assert.equal(configurationSchema.safeParse({ temperature: 'Hot', milk: 'Oat', syrup: 75, ice: 'None' }).success, false);
  assert.equal(configurationSchema.safeParse({ temperature: 'Hot', milk: 'Oat', syrup: 75 }).success, true);
  assert.equal(menuOptionsSchema.safeParse({ ...defaultMenuOptions, milks: ['Oat'] }).success, false);
  assert.equal(menuOptionsSchema.safeParse({ ...defaultMenuOptions, milks: ['Whole', 'Whole'] }).success, false);
  assert.equal(logInputSchema.safeParse({ eventId: randomUUID(), submissionId: randomUUID(), lines: [], recordedAt: new Date() }).success, false);
});
test('POS access requires an administrator', () => {
  const member = { id: 'member', email: 'member@mit.edu', isAdmin: false };
  assert.throws(() => assertPosAdmin(member), /Administrator/);
  assert.doesNotThrow(() => assertPosAdmin({ ...member, isAdmin: true }));
});
test('historical quantities and corrections remain bounded positive integers', () => {
  assert.equal(quantitySchema.parse(995 + 5), 1000);
  assert.equal(quantitySchema.safeParse(995 + 10).success, false);
  assert.equal(quantitySchema.safeParse(0).success, false);
  assert.equal(quantitySchema.safeParse(1.5).success, false);
});
test('the kiosk accepts exactly one drink per submission, with an optional kerb', () => {
  const line = { menuItemId: randomUUID(), menuVersion: 1, configuration: defaultMenuOptions.defaults, quantity: 1 };
  const input = { eventId: randomUUID(), submissionId: randomUUID(), lines: [line] };
  assert.equal(singleDrinkInputSchema.safeParse(input).success, true);
  assert.equal(singleDrinkInputSchema.parse({ ...input, kerb: '  jdoe  ' }).kerb, 'jdoe');
  assert.equal(singleDrinkInputSchema.safeParse({ ...input, lines: [] }).success, false);
  assert.equal(singleDrinkInputSchema.safeParse({ ...input, lines: [line, line] }).success, false);
  assert.equal(singleDrinkInputSchema.safeParse({ ...input, lines: [{ ...line, quantity: 2 }] }).success, false);
});
test('analytics sum drinks separately from orders and include zero/outside/DST buckets', () => {
  const orderId = randomUUID();
  const base = { id: randomUUID(), menuItemId: randomUUID(), drinkName: 'PSL', quantity: 2, configuration: defaultMenuOptions.defaults, submissionId: orderId, recordedAt: '2026-11-01T05:30:00Z', kerb: null, recordedBy: 'staff' } satisfies AnalyticsLog;
  const logs = [base, { ...base, id: randomUUID(), quantity: 1, recordedAt: '2026-11-01T06:30:00Z' }];
  const report = buildAnalytics(logs, { startsAt: '2026-11-01T05:00:00Z', endsAt: '2026-11-01T06:00:00Z' }, 15);
  assert.equal(report.totalDrinks, 3); assert.equal(report.totalOrders, 1); assert.equal(report.outsideWindowDrinks, 1);
  assert.equal(report.buckets.reduce((sum, bucket) => sum + bucket.drinks, 0), 3);
  assert(report.buckets.some(bucket => bucket.drinks === 0));
  assert(report.buckets.some(bucket => bucket.label.includes('EDT'))); assert(report.buckets.some(bucket => bucket.label.includes('EST')));
});
test('CSV uses valid rows and prevents spreadsheet formula interpretation', () => {
  const log = { id: randomUUID(), menuItemId: randomUUID(), drinkName: '=IMPORTDATA("bad")', quantity: 3, configuration: defaultMenuOptions.defaults, submissionId: randomUUID(), recordedAt: '2026-10-01T18:00:00Z', kerb: '\t@guest', recordedBy: 'staff' } satisfies AnalyticsLog;
  const csv = logsCsv([log]); assert(csv.includes("'=IMPORTDATA")); assert(csv.includes("'@guest")); assert(csv.includes('"3"')); assert(csv.includes('2026-10-01T18:00:00.000Z'));
});
test('order gaps use distinct valid submissions, sorted by receipt time', () => {
  const base = { id: randomUUID(), menuItemId: randomUUID(), drinkName: 'PSL', quantity: 2, configuration: defaultMenuOptions.defaults, submissionId: randomUUID(), recordedAt: '2026-10-01T18:00:00Z', kerb: null, recordedBy: 'staff' } satisfies AnalyticsLog;
  const event = { startsAt: '2026-10-01T18:00:00Z', endsAt: '2026-10-01T19:00:00Z' };
  assert.equal(buildAnalytics([], event, 15).averageOrderGapMs, null);
  assert.equal(buildAnalytics([base, { ...base, id: randomUUID(), quantity: 4 }], event, 15).averageOrderGapMs, null);
  const later = { ...base, id: randomUUID(), submissionId: randomUUID(), recordedAt: '2026-10-01T18:02:00Z' };
  const outside = { ...base, id: randomUUID(), submissionId: randomUUID(), recordedAt: '2026-10-01T17:59:00Z' };
  const report = buildAnalytics([later, base, outside, { ...base, id: randomUUID(), quantity: 5 }], event, 15);
  assert.equal(report.totalOrders, 3);
  assert.equal(report.averageOrderGapMs, 90000);
  assert.equal(buildAnalytics([base, { ...later, recordedAt: base.recordedAt }], event, 15).averageOrderGapMs, 0);
});
