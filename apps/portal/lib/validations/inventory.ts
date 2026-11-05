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

/** Supplier and bag size identify one way of buying an ingredient; import matches purchase options on this key. */
export function packageKey(supplier: string, bagSize: number) { return `${supplier.trim().toLowerCase()}|${bagSize}`; }

// One way of buying an ingredient: Costco 946 ml cartons and Star Market 1.89 l jugs are two options for one milk.
export const packageFieldsSchema = z.object({
  id: z.uuid().optional(),
  supplier: text(160).default(''),
  bagSize: z.number().finite().positive('Each purchase option needs a bag size above zero.').max(1_000_000),
  costPerBag: amount,
  sealedBags: amount,
  preferred: z.boolean().default(false),
}).strict();
export type PackageFields = z.infer<typeof packageFieldsSchema>;
export const packagesSchema = z.array(packageFieldsSchema).max(20).superRefine((list, context) => {
  const keys = list.map(option => packageKey(option.supplier, option.bagSize));
  if (new Set(keys).size !== keys.length) context.addIssue({ code: 'custom', message: 'Each purchase option needs a different supplier or bag size.' });
  if (list.filter(option => option.preferred).length > 1) context.addIssue({ code: 'custom', message: 'Mark at most one purchase option as preferred.' });
});

/** An ingredient that recipes use, with one or more ways of buying it. Counts, par and usage are per ingredient. */
export const itemFieldsSchema = z.object({
  name: text(160).min(1, 'Give the item a name.'),
  category: z.enum(itemCategories).catch('Other'),
  unit: z.enum(units),
  openAmount: amount,
  par: amount,
  notes: text(1000).default(''),
  packages: packagesSchema,
}).strict();
export type ItemFields = z.infer<typeof itemFieldsSchema>;

export const saveItemSchema = itemFieldsSchema.extend({
  id: z.uuid().optional(), expectedVersion: z.number().int().positive().optional(),
}).strict();
export const countItemSchema = z.object({
  id: z.uuid(), expectedVersion: z.number().int().positive(), openAmount: amount,
  packages: z.array(z.object({ id: z.uuid(), sealedBags: amount }).strict()).max(20),
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

// `auto` uses the published recipe whose name matches the drink, `none` stops tracking, a UUID pins a recipe.
export const menuLinkSchema = z.object({
  eventId: z.uuid(), menuItemId: z.uuid(),
  recipe: z.union([z.literal('auto'), z.literal('none'), z.uuid()]),
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
const numberLike = z.preprocess(value => (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)) ? Number(value) : value), amount);
// Prototype rows carry one bag size, sealed count and per-unit cost. Portal exports add `costPerBag` and `packages`.
export const bundleItemSchema = z.object({
  name: text(160).min(1, 'no name'),
  category: z.enum(itemCategories).catch('Other'),
  unit: z.enum(units, 'unit is not ml, g or each'),
  // Hand-written files often quote numbers. A value that is not a number is reported and the row skipped, never zeroed.
  bagSize: numberLike.optional(), sealedBags: numberLike.optional(), openBag: numberLike.optional(), par: numberLike.optional(), costPerUnit: numberLike.optional(),
  costPerBag: numberLike.optional(),
  supplier: text(160).catch(''),
  notes: text(1000).catch(''),
  packages: z.array(packageFieldsSchema.omit({ id: true }).strip()).max(20).optional(),
}).strip();
export const bundleEquipmentSchema = equipmentFieldsSchema.extend({
  quantity: z.preprocess(value => (typeof value === 'string' && value.trim() !== '' ? Number(value) : value), z.number().int().min(0).max(10_000)).default(0),
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
// Server actions accept Next's default 1 MB request body, so files are limited below that (in bytes on the client).
export const IMPORT_MAX_CHARS = 900_000;
export const importBundleSchema = z.object({ text: z.string().max(IMPORT_MAX_CHARS, 'That file is too large to import.') }).strict();
export const importCsvSchema = z.object({ text: z.string().max(IMPORT_MAX_CHARS, 'That file is too large to import.') }).strict();
