import { z } from 'zod';

const audienceFilterSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('all') }),
  z.object({
    type: z.literal('event'),
    eventId: z.string().uuid(),
    registrationStatus: z.string().nullable().optional(),
  }),
  z.object({
    type: z.literal('semester_status'),
    semesterStatus: z.string().min(1),
  }),
  z.object({
    type: z.literal('manual'),
    userIds: z.array(z.string()).min(1, 'Select at least one recipient'),
  }),
]);

export const createEmailBlastSchema = z.object({
  subject: z.string().min(1, 'Subject is required').max(255),
  bodyTemplate: z.string().min(1, 'Email body is required'),
  audienceType: z.enum(['all', 'event', 'semester_status', 'manual']),
  audienceFilters: audienceFilterSchema,
});

export const sendEmailBlastSchema = z.object({
  blastId: z.string().uuid(),
});

export type CreateEmailBlastInput = z.infer<typeof createEmailBlastSchema>;
