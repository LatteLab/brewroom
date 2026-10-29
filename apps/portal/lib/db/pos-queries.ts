import { createHash } from 'node:crypto';
import { and, asc, desc, eq, getTableColumns, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from './index';
import { posEvents, posMenuItems, posDrinkLogs, type PosDrinkLog } from './schema';
import { PosError, assertLogOwner, buildDrinkBreakdowns, easternInstant, posStaffAllowed, type PosActor } from '../pos';
import { configurationAllowed, configurationSchema, correctionInputSchema, deleteEventSchema, eventInputSchema, logInputSchema, menuInputSchema, removeMenuItemSchema, reorderMenuSchema, voidInputSchema, type LogInput } from '../validations/pos';

function staff(actor: PosActor) {
  if (!posStaffAllowed(actor, process.env.POS_STAFF_EMAILS ?? '')) throw new PosError('POS access is required.');
}
function admin(actor: PosActor) {
  if (!actor.isAdmin) throw new PosError('Administrator access is required.');
}
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const uuid = (value: unknown) => z.uuid().parse(value);
const eventDates = (input: z.infer<typeof eventInputSchema>) => {
  const startsAt = easternInstant(input.startsAt); const endsAt = easternInstant(input.endsAt);
  if (endsAt <= startsAt) throw new PosError('End time must be after start time.');
  return { name: input.name, startsAt, endsAt };
};
export async function listPosEvents(actor: PosActor) {
  staff(actor);
  return db.select().from(posEvents).orderBy(desc(posEvents.startsAt));
}
export async function getPosEvent(actor: PosActor, eventId: string) {
  staff(actor);
  const [event] = await db.select().from(posEvents).where(eq(posEvents.id, uuid(eventId)));
  return event ?? null;
}
export async function getPosMenu(actor: PosActor, eventId: string) {
  staff(actor);
  return db.select().from(posMenuItems).where(and(eq(posMenuItems.eventId, uuid(eventId)), isNull(posMenuItems.archivedAt))).orderBy(asc(posMenuItems.sortOrder), asc(posMenuItems.name));
}
export async function getPosLogs(actor: PosActor, eventId: string, includeHistory = false) {
  staff(actor);
  const conditions = [eq(posDrinkLogs.eventId, uuid(eventId))];
  if (!actor.isAdmin) conditions.push(eq(posDrinkLogs.recordedBy, actor.id));
  if (!includeHistory) conditions.push(isNull(posDrinkLogs.voidedAt));
  return db.select().from(posDrinkLogs).where(and(...conditions)).orderBy(desc(posDrinkLogs.recordedAt), asc(posDrinkLogs.lineIndex));
}
export async function createPosEvent(actor: PosActor, input: unknown) {
  admin(actor);
  const values = eventDates(eventInputSchema.parse(input));
  const [event] = await db.insert(posEvents).values({ ...values, createdBy: actor.id }).returning();
  return event;
}
export async function deletePosEvent(actor: PosActor, input: unknown) {
  admin(actor); const value = deleteEventSchema.parse(input);
  await db.transaction(async tx => {
    const [event] = await tx.select().from(posEvents).where(eq(posEvents.id, value.eventId)).for('update');
    if (!event) return;
    if (event.name !== value.nameConfirmation) throw new PosError('Type the current event name to confirm deletion. Refresh if its name changed.');
    await tx.delete(posDrinkLogs).where(eq(posDrinkLogs.eventId, event.id));
    await tx.delete(posMenuItems).where(eq(posMenuItems.eventId, event.id));
    await tx.delete(posEvents).where(eq(posEvents.id, event.id));
  });
  return value.eventId;
}
export async function getPosOverview(actor: PosActor) {
  admin(actor);
  return db.transaction(async tx => {
    const [events, drinks, configurations] = await Promise.all([
      tx.select({
        ...getTableColumns(posEvents),
        totalDrinks: sql<number>`coalesce(sum(${posDrinkLogs.quantity}), 0)`.mapWith(Number),
        totalOrders: sql<number>`count(distinct ${posDrinkLogs.submissionId})`.mapWith(Number),
      }).from(posEvents).leftJoin(posDrinkLogs, and(eq(posDrinkLogs.eventId, posEvents.id), isNull(posDrinkLogs.voidedAt))).groupBy(posEvents.id).orderBy(desc(posEvents.startsAt)),
      tx.select({ name: posDrinkLogs.drinkName, count: sql<number>`sum(${posDrinkLogs.quantity})`.mapWith(Number) }).from(posDrinkLogs).where(isNull(posDrinkLogs.voidedAt)).groupBy(posDrinkLogs.drinkName).orderBy(desc(sql`sum(${posDrinkLogs.quantity})`), asc(posDrinkLogs.drinkName)),
      tx.select({ configuration: posDrinkLogs.configuration, quantity: sql<number>`sum(${posDrinkLogs.quantity})`.mapWith(Number) }).from(posDrinkLogs).where(isNull(posDrinkLogs.voidedAt)).groupBy(posDrinkLogs.configuration),
    ]);
    const totalDrinks = events.reduce((sum, event) => sum + event.totalDrinks, 0);
    const totalOrders = events.reduce((sum, event) => sum + event.totalOrders, 0);
    return { events, totalDrinks, totalOrders, drinksPerOrder: totalOrders ? totalDrinks / totalOrders : null, drinks: drinks.map(drink => ({ ...drink, id: drink.name })), breakdowns: buildDrinkBreakdowns(configurations) };
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
}
export async function updatePosEvent(actor: PosActor, eventId: string, input: unknown) {
  admin(actor); const values = eventDates(eventInputSchema.parse(input));
  return db.transaction(async tx => {
    const [event] = await tx.update(posEvents).set({ ...values, updatedAt: new Date() }).where(eq(posEvents.id, uuid(eventId))).returning();
    if (!event) throw new PosError('Event not found.');
    return event;
  });
}
export async function savePosMenuItem(actor: PosActor, input: unknown) {
  admin(actor); const value = menuInputSchema.parse(input);
  return db.transaction(async tx => {
    const [event] = await tx.select({ id: posEvents.id }).from(posEvents).where(eq(posEvents.id, value.eventId)).for('update');
    if (!event) throw new PosError('Event not found.');
    if (value.id) {
      if (!value.expectedVersion) throw new PosError('Refresh the menu before editing.');
      const [item] = await tx.update(posMenuItems).set({ name: value.name, options: value.options, available: value.available, version: value.expectedVersion + 1 }).where(and(eq(posMenuItems.id, value.id), eq(posMenuItems.eventId, value.eventId), eq(posMenuItems.version, value.expectedVersion), isNull(posMenuItems.archivedAt))).returning();
      if (!item) throw new PosError('The menu changed. Refresh before saving again.');
      return item;
    }
    const existing = await tx.select({ sortOrder: posMenuItems.sortOrder }).from(posMenuItems).where(and(eq(posMenuItems.eventId, value.eventId), isNull(posMenuItems.archivedAt)));
    const sortOrder = Math.max(-1, ...existing.map(item => item.sortOrder)) + 1;
    const [item] = await tx.insert(posMenuItems).values({ eventId: value.eventId, name: value.name, options: value.options, available: value.available, sortOrder }).returning();
    return item;
  });
}
export async function removePosMenuItem(actor: PosActor, input: unknown) {
  admin(actor); const value = removeMenuItemSchema.parse(input);
  await db.transaction(async tx => {
    const [event] = await tx.select({ id: posEvents.id }).from(posEvents).where(eq(posEvents.id, value.eventId)).for('update');
    if (!event) throw new PosError('Event not found.');
    const [item] = await tx.select().from(posMenuItems).where(and(eq(posMenuItems.eventId, value.eventId), eq(posMenuItems.id, value.id)));
    if (!item) throw new PosError('Drink not found in this event.');
    if (item.archivedAt) return;
    if (item.version !== value.expectedVersion) throw new PosError('The menu changed. Refresh before removing this drink.');
    await tx.update(posMenuItems).set({ archivedAt: new Date(), available: false, version: item.version + 1 }).where(eq(posMenuItems.id, item.id));
  });
  return value.eventId;
}
export async function reorderPosMenu(actor: PosActor, input: unknown) {
  admin(actor); const value = reorderMenuSchema.parse(input);
  await db.transaction(async tx => {
    const [event] = await tx.select({ id: posEvents.id }).from(posEvents).where(eq(posEvents.id, value.eventId)).for('update');
    if (!event) throw new PosError('Event not found.');
    const items = await tx.select({ id: posMenuItems.id }).from(posMenuItems).where(and(eq(posMenuItems.eventId, value.eventId), isNull(posMenuItems.archivedAt))).orderBy(asc(posMenuItems.sortOrder), asc(posMenuItems.name));
    if (items.length !== value.itemIds.length || items.some(item => !value.itemIds.includes(item.id))) throw new PosError('The menu changed. Refresh before reordering.');
    if (items.every((item, index) => item.id === value.itemIds[index])) return;
    if (items.length !== value.expectedItemIds.length || items.some((item, index) => item.id !== value.expectedItemIds[index])) throw new PosError('The menu order changed. Refresh before reordering.');
    for (const [sortOrder, id] of value.itemIds.entries()) await tx.update(posMenuItems).set({ sortOrder }).where(and(eq(posMenuItems.id, id), eq(posMenuItems.eventId, value.eventId)));
  });
  return value.eventId;
}
function originalRequest(input: LogInput) {
  return { eventId: input.eventId, submissionId: input.submissionId, lines: input.lines, kerb: input.kerb || null };
}
export async function logPosDrinks(actor: PosActor, input: unknown) {
  staff(actor); const value = logInputSchema.parse(input); const requestHash = hash(originalRequest(value));
  return db.transaction(async tx => {
    const [event] = await tx.select().from(posEvents).where(eq(posEvents.id, value.eventId)).for('update');
    if (!event) throw new PosError('Event not found.');
    const original = await tx.select().from(posDrinkLogs).where(and(eq(posDrinkLogs.eventId, value.eventId), eq(posDrinkLogs.submissionId, value.submissionId), isNull(posDrinkLogs.replacesLogId))).orderBy(posDrinkLogs.lineIndex);
    if (original.length) {
      if (original.length !== value.lines.length || original.some((line, index) => line.recordedBy !== actor.id || line.lineIndex !== index || line.requestHash !== requestHash)) throw new PosError('This submission ID was already used for a different order.');
      return original;
    }
    const [clock] = await tx.execute(sql`select clock_timestamp() as now`); const now = z.coerce.date().parse(clock.now);
    if ((now < event.startsAt || now >= event.endsAt) && !value.outsideWindowConfirmed) throw new PosError('This event is outside its scheduled window. Confirm to record the order at the current time.');
    const menu = await tx.select().from(posMenuItems).where(and(eq(posMenuItems.eventId, value.eventId), isNull(posMenuItems.archivedAt)));
    const lines = value.lines.map((line, lineIndex) => {
      const item = menu.find(item => item.id === line.menuItemId);
      if (!item || !item.available) throw new PosError('A selected drink is no longer available. Refresh the menu.');
      if (item.version !== line.menuVersion) throw new PosError('The menu changed. Refresh it before recording this order.');
      if (!configurationAllowed(item.options, line.configuration)) throw new PosError('A selected option is not available for this drink.');
      return { eventId: value.eventId, menuItemId: item.id, menuVersion: item.version, drinkName: item.name, configuration: line.configuration, quantity: line.quantity, submissionId: value.submissionId, lineIndex, requestHash, recordedAt: now, recordedBy: actor.id, kerb: value.kerb || null };
    });
    return tx.insert(posDrinkLogs).values(lines).returning();
  });
}
export async function voidPosDrinkLog(actor: PosActor, input: unknown) {
  staff(actor); const value = voidInputSchema.parse(input);
  return db.transaction(async tx => {
    const [entry] = await tx.select({ eventId: posDrinkLogs.eventId }).from(posDrinkLogs).where(eq(posDrinkLogs.id, value.logId));
    if (!entry) throw new PosError('Entry not found.');
    const [event] = await tx.select({ id: posEvents.id }).from(posEvents).where(eq(posEvents.id, entry.eventId)).for('update');
    if (!event) throw new PosError('Event not found.');
    const [log] = await tx.select().from(posDrinkLogs).where(eq(posDrinkLogs.id, value.logId)).for('update');
    if (!log) throw new PosError('Entry not found.'); assertLogOwner(actor, log.recordedBy);
    if (log.voidedAt) {
      if (log.kerb === null) return log;
      const [cleared] = await tx.update(posDrinkLogs).set({ kerb: null }).where(eq(posDrinkLogs.id, log.id)).returning();
      return cleared;
    }
    const [voided] = await tx.update(posDrinkLogs).set({ voidedAt: new Date(), voidedBy: actor.id, voidReason: value.reason, kerb: null }).where(eq(posDrinkLogs.id, log.id)).returning();
    return voided;
  });
}
export async function correctPosDrinkLog(actor: PosActor, input: unknown) {
  staff(actor); const value = correctionInputSchema.parse(input); const mutationHash = hash({ logId: value.logId, configuration: value.configuration, quantity: value.quantity, kerb: value.kerb || null, reason: value.reason, actorId: actor.id });
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${value.mutationId}, 0))`);
    const [existing] = await tx.select().from(posDrinkLogs).where(eq(posDrinkLogs.mutationId, value.mutationId));
    if (existing) {
      if (existing.mutationHash !== mutationHash || existing.replacesLogId !== value.logId) throw new PosError('This correction ID was already used for a different change.');
      assertLogOwner(actor, existing.recordedBy); return existing;
    }
    const [entry] = await tx.select({ eventId: posDrinkLogs.eventId }).from(posDrinkLogs).where(eq(posDrinkLogs.id, value.logId));
    if (!entry) throw new PosError('Entry not found.');
    const [event] = await tx.select({ id: posEvents.id }).from(posEvents).where(eq(posEvents.id, entry.eventId)).for('update');
    if (!event) throw new PosError('Event not found.');
    const [original] = await tx.select().from(posDrinkLogs).where(eq(posDrinkLogs.id, value.logId)).for('update');
    if (!original) throw new PosError('Entry not found.'); assertLogOwner(actor, original.recordedBy);
    if (original.voidedAt) throw new PosError('This entry already changed. Refresh the recent entries.');
    const [menuItem] = await tx.select().from(posMenuItems).where(eq(posMenuItems.id, original.menuItemId));
    if (hash(value.configuration) !== hash(configurationSchema.parse(original.configuration)) && (!menuItem || !configurationAllowed(menuItem.options, value.configuration))) throw new PosError('The corrected choices are not supported by this drink.');
    await tx.update(posDrinkLogs).set({ voidedAt: new Date(), voidedBy: actor.id, voidReason: value.reason, kerb: null }).where(eq(posDrinkLogs.id, original.id));
    const replacement: typeof posDrinkLogs.$inferInsert = {
      eventId: original.eventId, menuItemId: original.menuItemId, menuVersion: original.menuVersion, drinkName: original.drinkName,
      configuration: value.configuration, quantity: value.quantity, submissionId: original.submissionId, lineIndex: original.lineIndex,
      requestHash: original.requestHash, recordedAt: original.recordedAt, recordedBy: original.recordedBy, kerb: value.kerb || null,
      replacesLogId: original.id, mutationId: value.mutationId, mutationHash,
    };
    const [log] = await tx.insert(posDrinkLogs).values(replacement).returning(); return log;
  });
}
export async function getPosReport(actor: PosActor, eventId: string): Promise<PosDrinkLog[]> {
  admin(actor);
  return getPosLogs(actor, eventId);
}
