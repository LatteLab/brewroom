import { z } from 'zod';

// FormData sends booleans as the strings "true" or "false".
// z.coerce.boolean() uses Boolean() which maps any non-empty string to true,
// so we preprocess explicitly to handle the "false" string correctly.
const formBool = z.preprocess(
  (v) => (v === 'false' || v === '0' || v === '' ? false : Boolean(v)),
  z.boolean(),
);

const eventBaseSchema = z.object({
  name: z.string().min(1, 'Event name is required').max(255),
  description: z.string().optional(),
  coverImage: z.string().optional().or(z.literal('')),
  date: z.coerce.date({ error: 'Event date is required' }),
  endDate: z.coerce.date().optional(),
  location: z.string().optional(),
  capacity: z.coerce.number().int().min(1, 'Capacity must be at least 1'),
  visibility: z.enum(['private', 'public']).default('private'),
  waitlistEnabled: formBool.pipe(z.boolean()).default(false),
  plusOneEnabled: formBool.pipe(z.boolean()).default(false),
  requireApproval: formBool.pipe(z.boolean()).default(false),
  showAttendeesPreRegistration: formBool.pipe(z.boolean()).default(true),
  questions: z.string().optional(),
  timezone: z.string().min(1, 'Timezone is required'),
});

const endDateAfterStart = {
  check: (data: { date?: Date; endDate?: Date }) =>
    !data.endDate || !data.date || data.endDate > data.date,
  message: 'End date must be after start date',
  path: ['endDate'] as string[],
};

export const createEventSchema = eventBaseSchema
  .refine(
    (data) => !data.date || data.date > new Date(),
    { message: 'Start date must be in the future', path: ['date'] },
  )
  .refine(
    endDateAfterStart.check,
    { message: endDateAfterStart.message, path: endDateAfterStart.path },
  );

// Update schema: requireApproval is NOT included (locked at creation)
export const updateEventSchema = eventBaseSchema
  .omit({ requireApproval: true })
  .partial()
  .refine(endDateAfterStart.check, {
    message: endDateAfterStart.message,
    path: endDateAfterStart.path,
  });

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
