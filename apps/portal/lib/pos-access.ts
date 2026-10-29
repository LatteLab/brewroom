import { auth } from '@/auth';
import { PosError, posStaffAllowed, type PosActor } from './pos';

export async function requirePosActor(adminOnly = false): Promise<PosActor> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) throw new PosError('Sign in to use the POS.');
  const actor = { id: session.user.id, email: session.user.email, isAdmin: session.user.isAdmin === true };
  if (adminOnly ? !actor.isAdmin : !posStaffAllowed(actor, process.env.POS_STAFF_EMAILS ?? '')) throw new PosError('You do not have access to this POS page.');
  return actor;
}
