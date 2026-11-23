import { and, asc, eq, getTableColumns, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from './index';
import { inventoryItems, posEvents, posMenuIngredients, posMenuItems } from './schema';
import { PosError, assertPosAdmin, type PosActor } from '../pos';
import { deleteInventoryItemSchema, inventoryCountSchema, inventoryItemInputSchema, menuIngredientsInputSchema } from '../validations/inventory';

const uniqueViolation = (error: unknown) => (error as { code?: string; cause?: { code?: string } })?.code === '23505' || (error as { cause?: { code?: string } })?.cause?.code === '23505';
const foreignKeyViolation = (error: unknown) => (error as { code?: string })?.code === '23503' || (error as { cause?: { code?: string } })?.cause?.code === '23503';

export async function listInventoryItems(actor: PosActor) {
  assertPosAdmin(actor);
  return db.select().from(inventoryItems).orderBy(asc(inventoryItems.name));
}
export async function createInventoryItem(actor: PosActor, input: unknown) {
  assertPosAdmin(actor); const value = inventoryItemInputSchema.parse(input);
  try {
    const [item] = await db.insert(inventoryItems).values({ ...value, updatedBy: actor.id }).returning();
    return item;
  } catch (error) {
    if (uniqueViolation(error)) throw new PosError('An item with that name already exists.');
    throw error;
  }
}
export async function updateInventoryCount(actor: PosActor, input: unknown) {
  assertPosAdmin(actor); const value = inventoryCountSchema.parse(input);
  const [item] = await db.update(inventoryItems)
    .set({ onHand: value.onHand, lowAt: value.lowAt, updatedAt: new Date(), updatedBy: actor.id, version: value.expectedVersion + 1 })
    .where(and(eq(inventoryItems.id, value.id), eq(inventoryItems.version, value.expectedVersion))).returning();
  if (!item) throw new PosError('This item changed or was deleted. Refresh before saving again.');
  return item;
}
export async function deleteInventoryItem(actor: PosActor, input: unknown) {
  assertPosAdmin(actor); const value = deleteInventoryItemSchema.parse(input);
  try {
    await db.delete(inventoryItems).where(eq(inventoryItems.id, value.id));
  } catch (error) {
    if (foreignKeyViolation(error)) throw new PosError('A menu drink uses this item. Remove it from those ingredients first.');
    throw error;
  }
}

/** Ingredient lines for every drink on an event's menu, including archived drinks so past logs still count. */
export async function getEventIngredients(actor: PosActor, eventId: string) {
  assertPosAdmin(actor);
  return db.select(getTableColumns(posMenuIngredients))
    .from(posMenuIngredients).innerJoin(posMenuItems, eq(posMenuItems.id, posMenuIngredients.menuItemId))
    .where(eq(posMenuItems.eventId, z.uuid().parse(eventId))).orderBy(asc(posMenuIngredients.sortOrder));
}

/** Replaces one drink's ingredient lines under the event lock. The drink's menu version is unchanged. */
export async function saveMenuIngredients(actor: PosActor, input: unknown) {
  assertPosAdmin(actor); const value = menuIngredientsInputSchema.parse(input);
  return db.transaction(async tx => {
    const [event] = await tx.select({ id: posEvents.id }).from(posEvents).where(eq(posEvents.id, value.eventId)).for('update');
    if (!event) throw new PosError('Event not found.');
    const [item] = await tx.select({ id: posMenuItems.id, archivedAt: posMenuItems.archivedAt }).from(posMenuItems).where(and(eq(posMenuItems.id, value.menuItemId), eq(posMenuItems.eventId, value.eventId)));
    if (!item || item.archivedAt) throw new PosError('Drink not found in this event.');
    const itemIds = [...new Set(value.ingredients.map(line => line.itemId))];
    if (itemIds.length) {
      const found = await tx.select({ id: inventoryItems.id }).from(inventoryItems).where(inArray(inventoryItems.id, itemIds));
      if (found.length !== itemIds.length) throw new PosError('A selected stock item no longer exists. Refresh and try again.');
    }
    await tx.delete(posMenuIngredients).where(eq(posMenuIngredients.menuItemId, item.id));
    if (!value.ingredients.length) return [];
    return tx.insert(posMenuIngredients).values(value.ingredients.map((line, sortOrder) => ({ ...line, menuItemId: item.id, sortOrder }))).returning();
  });
}
