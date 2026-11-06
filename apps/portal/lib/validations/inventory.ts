import { z } from 'zod';

export const inventoryUnits = ['ml', 'g', 'each'] as const;
export type InventoryUnit = (typeof inventoryUnits)[number];
export const ingredientConditions = ['always', 'hot', 'iced', 'whole', 'oat'] as const;
export type IngredientCondition = (typeof ingredientConditions)[number];
export const conditionLabels: Record<IngredientCondition, string> = { always: 'Always', hot: 'Hot', iced: 'Iced', whole: 'Whole milk', oat: 'Oat milk' };

const amount = z.number().finite().min(0, 'Amounts cannot be negative.').max(10_000_000);
export const inventoryItemInputSchema = z.object({
  name: z.string().trim().min(1, 'Enter an item name.').max(120),
  unit: z.enum(inventoryUnits),
  onHand: amount,
  lowAt: amount,
}).strict();
export const inventoryCountSchema = z.object({
  id: z.uuid(), expectedVersion: z.number().int().positive(), onHand: amount, lowAt: amount,
}).strict();
export const deleteInventoryItemSchema = z.object({ id: z.uuid() }).strict();
export const ingredientLineSchema = z.object({
  itemId: z.uuid(),
  quantity: z.number().finite().positive('Ingredient amounts must be more than zero.').max(100_000),
  appliesWhen: z.enum(ingredientConditions),
  scalesWithSyrup: z.boolean(),
}).strict();
export const menuIngredientsInputSchema = z.object({
  eventId: z.uuid(), menuItemId: z.uuid(), ingredients: z.array(ingredientLineSchema).max(30),
}).strict();
export type IngredientLine = z.infer<typeof ingredientLineSchema>;
