'use server';

import { auth } from '@/auth';
import { addAdminEmail as dbAddAdminEmail, removeAdminEmail as dbRemoveAdminEmail } from '@/lib/db';
import {
  getSemesters,
  setSemesterOverride,
  clearSemesterOverride,
  getCurrentSemesterLabel,
  detectSemesterLabel,
} from '@/lib/db/event-queries';
import { revalidatePath } from 'next/cache';
import type { AdminWhitelist } from '@/lib/db';

export async function addAdminEmail(email: string): Promise<AdminWhitelist> {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const cleanEmail = email.trim();
  const result = await dbAddAdminEmail(cleanEmail);
  revalidatePath('/admin');
  return result;
}

export async function removeAdminEmail(id: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  await dbRemoveAdminEmail(id);
  revalidatePath('/admin');
}

export async function getSemesterData() {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const [currentLabel, allSemesters, autoLabel] = await Promise.all([
    getCurrentSemesterLabel(),
    getSemesters(),
    Promise.resolve(detectSemesterLabel()),
  ]);

  const hasOverride = allSemesters.some(s => s.isCurrent);

  return {
    currentLabel,
    autoLabel,
    hasOverride,
    semesters: allSemesters,
  };
}

export async function setSemesterAction(label: string) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const cleanLabel = label.trim();
  if (!cleanLabel) throw new Error('Semester label cannot be empty');
  await setSemesterOverride(cleanLabel);
  revalidatePath('/admin/settings');
}

export async function clearSemesterAction() {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  await clearSemesterOverride();
  revalidatePath('/admin/settings');
}
