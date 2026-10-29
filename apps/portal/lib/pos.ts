import type { Configuration } from './validations/pos';

export class PosError extends Error {}

export const POS_TIMEZONE = 'America/New_York';
export type PosActor = { id: string; email: string; isAdmin: boolean };
export function posStaffAllowed(actor: PosActor, allowlist: string) {
  return actor.isAdmin || allowlist.split(',').map(email => email.trim().toLowerCase()).filter(Boolean).includes(actor.email.trim().toLowerCase());
}
export function assertLogOwner(actor: PosActor, recordedBy: string) {
  if (!actor.isAdmin && actor.id !== recordedBy) throw new PosError('You can change only your own entries.');
}
export function easternInput(date: Date | string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: POS_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(date));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(value => value.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}
export function easternInstant(input: string) {
  const nominal = new Date(`${input}:00Z`);
  if (!Number.isFinite(nominal.getTime())) throw new PosError('Enter a valid Eastern date and time.');
  const matches = [4, 5].map(offset => new Date(nominal.getTime() + offset * 3600000)).filter(date => easternInput(date) === input);
  if (matches.length !== 1) throw new PosError('This Eastern time is skipped or repeated by daylight saving time. Choose another time.');
  return matches[0];
}
export function formatPosDate(date: Date | string, timeOnly = false) {
  return new Intl.DateTimeFormat('en-US', { timeZone: POS_TIMEZONE, ...(timeOnly ? {} : { month: 'short', day: 'numeric', year: 'numeric' }), hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(date));
}
export function configurationLabel(value: Configuration) {
  return `${value.temperature} · ${value.milk} milk · double espresso · ${value.syrup}% syrup${value.temperature === 'Iced' ? ` · ${value.ice === 'None' ? 'no' : value.ice.toLowerCase()} ice` : ''}`;
}
export type AnalyticsLog = { id: string; menuItemId: string; drinkName: string; configuration: Configuration; quantity: number; submissionId: string; recordedAt: Date | string; kerb: string | null; recordedBy: string };
export function buildAnalytics(logs: AnalyticsLog[], event: { startsAt: Date | string; endsAt: Date | string }, intervalMinutes: 5 | 15) {
  const requestedStep = intervalMinutes * 60000;
  const start = new Date(event.startsAt).getTime(); const end = new Date(event.endsAt).getTime();
  const min = logs.reduce((time, log) => Math.min(time, new Date(log.recordedAt).getTime()), start);
  const max = logs.reduce((time, log) => Math.max(time, new Date(log.recordedAt).getTime()), Math.min(end, Math.max(start, Date.now())));
  const step = Math.max(requestedStep, Math.ceil((max - min) / (5000 * requestedStep)) * requestedStep);
  const first = Math.floor(min / step) * step; const last = Math.floor(max / step) * step;
  const buckets = new Map<number, { at: string; label: string; drinks: number; orders: Set<string> }>();
  for (let time = first; time <= last; time += step) buckets.set(time, { at: new Date(time).toISOString(), label: formatPosDate(new Date(time), true), drinks: 0, orders: new Set() });
  const drinks = new Map<string, { name: string; count: number }>();
  const orderTimes = new Map<string, number>();
  const breakdowns: Record<string, Record<string, number>> = { Temperature: {}, Milk: {}, Syrup: {}, Ice: {} };
  for (const log of logs) {
    const time = new Date(log.recordedAt).getTime();
    orderTimes.set(log.submissionId, Math.min(orderTimes.get(log.submissionId) ?? time, time));
    const bucket = buckets.get(Math.floor(new Date(log.recordedAt).getTime() / step) * step);
    if (bucket) { bucket.drinks += log.quantity; bucket.orders.add(log.submissionId); }
    const previous = drinks.get(log.menuItemId); drinks.set(log.menuItemId, { name: previous?.name ?? log.drinkName, count: (previous?.count ?? 0) + log.quantity });
    const values = { Temperature: log.configuration.temperature, Milk: log.configuration.milk, Syrup: `${log.configuration.syrup}%`, Ice: log.configuration.temperature === 'Iced' ? log.configuration.ice : 'Not applicable (hot)' };
    for (const [key, value] of Object.entries(values)) breakdowns[key][value] = (breakdowns[key][value] ?? 0) + log.quantity;
  }
  const totalDrinks = logs.reduce((sum, log) => sum + log.quantity, 0);
  const orderedTimes = [...orderTimes.values()].sort((a, b) => a - b);
  const averageOrderGapMs = orderedTimes.length < 2 ? null : (orderedTimes[orderedTimes.length - 1] - orderedTimes[0]) / (orderedTimes.length - 1);
  const elapsedHours = (Math.min(end, Math.max(start, Date.now())) - start) / 3600000;
  const withinWindowDrinks = logs.filter(log => { const time = new Date(log.recordedAt).getTime(); return time >= start && time < end; }).reduce((sum, log) => sum + log.quantity, 0);
  return { intervalMinutes: step / 60000, totalDrinks, totalOrders: orderTimes.size, averageOrderGapMs, outsideWindowDrinks: logs.filter(log => { const time = new Date(log.recordedAt).getTime(); return time < start || time >= end; }).reduce((sum, log) => sum + log.quantity, 0), drinks: [...drinks.entries()].map(([id, value]) => ({ id, ...value })).sort((a, b) => b.count - a.count), breakdowns, buckets: [...buckets.values()].map(bucket => ({ ...bucket, orders: bucket.orders.size })), averagePerHour: elapsedHours >= 1 / 60 ? withinWindowDrinks / elapsedHours : null };
}
export function logsCsv(logs: AnalyticsLog[]) {
  const cell = (value: string | number) => `"${String(value).replace(/^[\s]*([=+@-])/, "'$1").replaceAll('"', '""')}"`;
  const rows: (string | number)[][] = [['Submission ID', 'Recorded at (UTC)', 'Recorded at (Eastern)', 'Drink', 'Quantity', 'Temperature', 'Milk', 'Syrup (%)', 'Ice', 'Espresso shots', 'Kerb', 'Recorded by']];
  for (const log of logs) rows.push([log.submissionId, new Date(log.recordedAt).toISOString(), formatPosDate(log.recordedAt), log.drinkName, log.quantity, log.configuration.temperature, log.configuration.milk, log.configuration.syrup, log.configuration.temperature === 'Iced' ? log.configuration.ice : '', 2, log.kerb ?? '', log.recordedBy]);
  return '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
