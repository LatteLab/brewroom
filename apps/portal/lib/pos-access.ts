import { auth } from '@/auth';
import { PosError, assertPosAdmin, type PosActor } from './pos';

export async function requirePosActor(): Promise<PosActor> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) throw new PosError('Sign in to use the POS.');
  const actor = { id: session.user.id, email: session.user.email, isAdmin: session.user.isAdmin === true };
  assertPosAdmin(actor);
  return actor;
}
