'use server';

import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getUserById } from '@/lib/db/queries';
import { updateUserProfile } from '@/lib/db/event-queries';
import { updateProfileSchema, updateProfileImageSchema } from '@/lib/validations/profile';
import { z } from 'zod';

export async function updateProfile(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');

  // Coerce checkboxes: present = true, absent = false
  const raw = {
    ...Object.fromEntries(formData),
    isVisibleInDirectory: formData.has('isVisibleInDirectory'),
    hidePhone: formData.has('hidePhone'),
  };
  const parsed = updateProfileSchema.parse(raw);

  // Convert empty strings to null for string fields, preserve booleans as-is
  const data: Parameters<typeof updateUserProfile>[1] = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === 'boolean') {
      (data as Record<string, unknown>)[key] = value;
    } else {
      (data as Record<string, unknown>)[key] = value === '' ? null : value;
    }
  }

  // Prevent clearing fields that already have values
  const current = await getUserById(session.user.id);
  if (current) {
    const protectedFields = ['major', 'classYear', 'phone', 'interests', 'bio', 'location'] as const;
    for (const field of protectedFields) {
      if (current[field] && (data[field] === null || data[field] === undefined)) {
        data[field] = current[field];
      }
    }
  }

  await updateUserProfile(session.user.id, data);

  revalidatePath('/user/settings');
  revalidatePath('/user/directory');
}

const onboardingSchema = z.object({
  major: z.string().min(1, 'Major is required').max(100),
  classYear: z.string().min(1, 'Class year is required').max(50),
  interests: z.string().min(1, 'Interests are required').max(300),
  phone: z.string().max(20).regex(/^[+\d\s\-(). ]*$/, 'Invalid phone number format').optional(),
  bio: z.string().max(500).optional(),
});

export async function completeOnboardingAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');

  const parsed = onboardingSchema.parse(Object.fromEntries(formData));

  await updateUserProfile(session.user.id, {
    major: parsed.major,
    classYear: parsed.classYear,
    interests: parsed.interests,
    phone: parsed.phone || null,
    bio: parsed.bio || null,
  });

  revalidatePath('/user/onboarding');
  redirect('/user/events');
}

export async function updateProfileImage(imageUrl: string) {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');

  updateProfileImageSchema.parse({ imageUrl });

  await updateUserProfile(session.user.id, { image: imageUrl });

  revalidatePath('/user/settings');
  revalidatePath('/user/directory');
}

export async function removeProfileImage() {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');

  await updateUserProfile(session.user.id, { image: null });

  revalidatePath('/user/settings');
  revalidatePath('/user/directory');
}
