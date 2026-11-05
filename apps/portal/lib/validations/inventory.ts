import { z } from 'zod';

// Vocabulary carried over from the inventory prototype (LatteLab/inventory-system-draft).
// Units are never converted: an item is counted in exactly one unit and recipes use it.
export const units = ['ml', 'g', 'each'] as const;
export const itemCategories = ['Coffee', 'Milk', 'Syrup', 'Powder', 'Topping', 'Supplies', 'Other'] as const;
export const recipeCategories = ['Espresso', 'Filter', 'Iced', 'Tea', 'Other'] as const;
export const equipmentCategories = ['Machine', 'Grinder', 'Brewing', 'Tools', 'Serving', 'Furniture', 'Signage', 'Other'] as const;
export const equipmentStatuses = ['ok', 'repair', 'loaned', 'missing', 'retired'] as const;

// How a recipe line responds to the POS drink configuration. These are new in the portal:
// the prototype's recipes describe one fixed drink, while POS drinks are configured per order.
export const ingredientConditions = ['always', 'hot', 'iced', 'whole', 'oat'] as const;
export const ingredientScales = ['fixed', 'syrup', 'ice'] as const;

const amount = z.number().finite().min(0).max(1_000_000);
const text = (max: number) => z.string().trim().max(max);

export const ingredientSchema = z.object({
  item: text(160).min(1, 'Pick an inventory item for every ingredient.'),
  qty: amount,
  unit: z.string().trim().max(16).default(''),
  note: text(200).default(''),
  when: z.enum(ingredientConditions).default('always'),
  scale: z.enum(ingredientScales).default('fixed'),
}).strict();
export type Ingredient = z.infer<typeof ingredientSchema>;

export const recipeBodySchema = z.object({
  name: text(120),
  category: z.enum(recipeCategories).catch('Other'),
  ingredients: z.array(ingredientSchema).max(60),
  steps: z.array(text(1000)).max(60),
  notes: text(4000).default(''),
}).strict();
export type RecipeBody = z.infer<typeof recipeBodySchema>;

export const itemFieldsSchema = z.object({
  name: text(160).min(1, 'Give the item a name.'),
  category: z.enum(itemCategories).catch('Other'),
  unit: z.enum(units),
  bagSize: amount,
  sealedBags: amount,
  openBag: amount,
  par: amount,
  costPerUnit: amount,
  supplier: text(160).default(''),
  notes: text(1000).default(''),
}).strict();
export type ItemFields = z.infer<typeof itemFieldsSchema>;

export const saveItemSchema = itemFieldsSchema.extend({
  id: z.uuid().optional(), expectedVersion: z.number().int().positive().optional(),
}).strict();
export const countItemSchema = z.object({
  id: z.uuid(), expectedVersion: z.number().int().positive(), sealedBags: amount, openBag: amount,
}).strict();
export const deleteByIdSchema = z.object({ id: z.uuid() }).strict();

export const equipmentFieldsSchema = z.object({
  name: text(160).min(1, 'Give the equipment a name.'),
  category: z.enum(equipmentCategories).catch('Other'),
  quantity: z.number().int().min(0).max(10_000),
  status: z.enum(equipmentStatuses),
  location: text(200).default(''),
  custodian: text(160).default(''),
  serial: text(160).default(''),
  notes: text(1000).default(''),
  lastCheckedAt: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD for the last-checked date.')]).default(''),
}).strict();
export type EquipmentFields = z.infer<typeof equipmentFieldsSchema>;
export const saveEquipmentSchema = equipmentFieldsSchema.extend({
  id: z.uuid().optional(), expectedVersion: z.number().int().positive().optional(),
}).strict();

export const createRecipeSchema = z.object({ name: text(120).min(1, 'Give the recipe a name.') }).strict();
export const saveDraftSchema = z.object({ id: z.uuid(), expectedVersion: z.number().int().positive(), body: recipeBodySchema }).strict();
export const recipeTransitionSchema = z.object({ id: z.uuid(), expectedVersion: z.number().int().positive() }).strict();

export const menuLinkSchema = z.object({
  eventId: z.uuid(), menuItemId: z.uuid(),
  recipeId: z.uuid().nullable(),
  plannedServings: z.number().int().min(0).max(100_000),
}).strict();

// The prototype's exchange bundle (docs/data-exchange.md, format "lattelab-data" version 1).
// Rows are parsed one at a time so a bad row is skipped and reported rather than failing the file.
export const BUNDLE_FORMAT = 'lattelab-data';
export const BUNDLE_VERSION = 1;
export const bundleEnvelopeSchema = z.object({
  format: z.string().optional(),
  version: z.number().optional(),
  inventory: z.array(z.unknown()).optional(),
  equipment: z.array(z.unknown()).optional(),
  recipes: z.array(z.unknown()).optional(),
  guidelines: z.array(z.unknown()).optional(),
});
export const bundleItemSchema = itemFieldsSchema.extend({
  bagSize: amount.catch(0), sealedBags: amount.catch(0), openBag: amount.catch(0), par: amount.catch(0), costPerUnit: amount.catch(0),
}).strip();
export const bundleEquipmentSchema = equipmentFieldsSchema.extend({
  quantity: z.number().int().min(0).max(10_000).catch(0),
  status: z.enum(equipmentStatuses).default('ok'),
}).strip();
export const bundleRecipeSchema = z.object({
  slug: z.string().trim().max(120).optional(),
  name: text(120).min(1),
  category: z.enum(recipeCategories).catch('Other'),
  status: z.enum(['published', 'draft']).default('draft'),
  ingredients: z.array(ingredientSchema.strip()).min(1, 'A recipe needs at least one ingredient.').max(60),
  steps: z.array(text(1000)).max(60).default([]),
  notes: text(4000).default(''),
}).strip();
export const importBundleSchema = z.object({ text: z.string().max(2_000_000) }).strict();
export const importCsvSchema = z.object({ text: z.string().max(2_000_000) }).strict();
