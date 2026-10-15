import { z } from 'zod';

export const updateProfileSchema = z.object({
  major: z.string().max(100).optional().or(z.literal('')),
  classYear: z.string().max(50).optional().or(z.literal('')),
  phone: z.string().max(20).regex(/^[+\d\s\-(). ]*$/, 'Invalid phone number format').optional().or(z.literal('')),
  interests: z.string().max(300, 'Interests must be 300 characters or less').optional().or(z.literal('')),
  bio: z.string().max(500, 'Bio must be 500 characters or less').optional().or(z.literal('')),
  location: z.string().max(100).optional().or(z.literal('')),
  isVisibleInDirectory: z.boolean().optional(),
  hidePhone: z.boolean().optional(),
});

export const updateProfileImageSchema = z.object({
  imageUrl: z.string().url().refine(
    (url) => url.startsWith(process.env.NEXT_PUBLIC_SUPABASE_URL!),
    'Image URL must be from Supabase storage'
  ),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
