'use server';

import { signOut as nextAuthSignOut } from '@/auth';

export async function signOut() {
  await nextAuthSignOut({ redirectTo: '/login' });
}
