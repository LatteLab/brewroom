import { z } from 'zod';

export const temperatures = ['Iced', 'Hot'] as const;
export const milks = ['Whole', 'Oat'] as const;
export const syrups = [50, 75, 100] as const;
export const iceLevels = ['None', 'Light', 'Full'] as const;
const syrupSchema = z.union([z.literal(50), z.literal(75), z.literal(100)]);
const common = { milk: z.enum(milks), syrup: syrupSchema };
export const configurationSchema = z.discriminatedUnion('temperature', [
  z.object({ ...common, temperature: z.literal('Iced'), ice: z.enum(iceLevels) }).strict(),
  z.object({ ...common, temperature: z.literal('Hot') }).strict(),
]);
export type Configuration = z.infer<typeof configurationSchema>;
export const menuOptionsSchema = z.object({
  temperatures: z.array(z.enum(temperatures)).min(1).max(2),
  milks: z.array(z.enum(milks)).min(1).max(2),
  syrups: z.array(syrupSchema).min(1).max(3),
  iceLevels: z.array(z.enum(iceLevels)).min(1).max(3),
  defaults: configurationSchema,
}).strict().superRefine((value, context) => {
  if (!configurationAllowed(value, value.defaults)) context.addIssue({ code: 'custom', message: 'Defaults must be among the available choices.', path: ['defaults'] });
  for (const field of ['temperatures', 'milks', 'syrups', 'iceLevels'] as const) {
    if (new Set<string | number>(value[field]).size !== value[field].length) context.addIssue({ code: 'custom', message: 'Each choice can appear only once.', path: [field] });
  }
});
export type MenuOptions = z.infer<typeof menuOptionsSchema>;
export function configurationAllowed(options: Omit<MenuOptions, 'defaults'>, value: Configuration) {
  return options.temperatures.includes(value.temperature) && options.milks.includes(value.milk) && options.syrups.includes(value.syrup)
    && (value.temperature === 'Hot' || options.iceLevels.includes(value.ice));
}
export const defaultMenuOptions: MenuOptions = {
  temperatures: ['Iced', 'Hot'], milks: ['Whole', 'Oat'], syrups: [50, 75, 100], iceLevels: ['None', 'Light', 'Full'],
  defaults: { temperature: 'Iced', milk: 'Whole', syrup: 100, ice: 'Full' },
};
export const eventInputSchema = z.object({
  name: z.string().trim().min(1, 'Enter an event name.').max(160),
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Enter a date and time.'),
  endsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Enter a date and time.'),
}).strict();
export const deleteEventSchema = z.object({ eventId: z.uuid(), nameConfirmation: z.string().trim().min(1).max(160) }).strict();
export const menuInputSchema = z.object({
  eventId: z.uuid(), id: z.uuid().optional(), expectedVersion: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(120), options: menuOptionsSchema,
  available: z.boolean(),
}).strict();
export const reorderMenuSchema = z.object({
  eventId: z.uuid(), itemIds: z.array(z.uuid()), expectedItemIds: z.array(z.uuid()),
}).strict().superRefine((value, context) => {
  for (const field of ['itemIds', 'expectedItemIds'] as const) {
    if (new Set(value[field]).size !== value[field].length) context.addIssue({ code: 'custom', message: 'Each drink must appear exactly once.', path: [field] });
  }
});
export const quantitySchema = z.number().int().min(1).max(1000);
const lineSchema = z.object({ menuItemId: z.uuid(), menuVersion: z.number().int().positive(), configuration: configurationSchema, quantity: quantitySchema }).strict();
export const logInputSchema = z.object({
  eventId: z.uuid(), submissionId: z.uuid(), lines: z.array(lineSchema).min(1).max(50),
  kerb: z.string().trim().max(64).nullable().optional(), outsideWindowConfirmed: z.boolean().default(false),
}).strict();
export type LogInput = z.infer<typeof logInputSchema>;
export const singleDrinkInputSchema = logInputSchema.extend({ lines: z.tuple([lineSchema.extend({ quantity: z.literal(1) })]) });
export type SingleDrinkInput = z.infer<typeof singleDrinkInputSchema>;
export const correctionInputSchema = z.object({
  logId: z.uuid(), mutationId: z.uuid(), configuration: configurationSchema,
  quantity: quantitySchema, kerb: z.string().trim().max(64).nullable().optional(),
  reason: z.string().trim().min(1, 'Enter a correction reason.').max(300),
}).strict();
export const voidInputSchema = z.object({ logId: z.uuid(), reason: z.string().trim().min(1, 'Enter a reason.').max(300) }).strict();
