import { auth } from '@/auth';
import { InventoryError } from './inventory';
import type { PosActor } from './pos';

/** Inventory is admin-only, the same audience as POS setup and reports. */
export async function requireInventoryAdmin(): Promise<PosActor> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) throw new InventoryError('Sign in to use inventory.');
  if (session.user.isAdmin !== true) throw new InventoryError('Administrator access is required.');
  return { id: session.user.id, email: session.user.email, isAdmin: true };
}
