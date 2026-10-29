'use server';

import { PosError } from '@/lib/pos';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePosActor } from '@/lib/pos-access';
import { singleDrinkInputSchema } from '@/lib/validations/pos';
import { createPosEvent, deletePosEvent, updatePosEvent, getPosMenu, savePosMenuItem, reorderPosMenu, logPosDrinks, voidPosDrinkLog, correctPosDrinkLog } from '@/lib/db/pos-queries';

function failure(error: unknown) {
  if (error instanceof z.ZodError) return { ok: false as const, retryable: false, error: error.issues.map(issue => issue.message).join(' ') };
  if (error instanceof PosError) return { ok: false as const, retryable: false, error: error.message };
  console.error('POS operation failed', error);
  return { ok: false as const, retryable: true, error: 'Could not confirm the change. Retry the same request.' };
}
function refresh(eventId: string) { revalidatePath('/admin/pos'); revalidatePath(`/admin/pos/${eventId}`); revalidatePath('/kiosk'); revalidatePath(`/kiosk/${eventId}`); }
export async function createPosEventAction(input: unknown) {
  try { const event = await createPosEvent(await requirePosActor(true), input); refresh(event.id); return { ok: true as const, event }; } catch (error) { return failure(error); }
}
export async function deletePosEventAction(input: unknown) {
  try { const eventId = await deletePosEvent(await requirePosActor(true), input); refresh(eventId); return { ok: true as const }; } catch (error) { return failure(error); }
}
export async function updatePosEventAction(eventId: string, input: unknown) {
  try { const event = await updatePosEvent(await requirePosActor(true), eventId, input); refresh(event.id); return { ok: true as const, event }; } catch (error) { return failure(error); }
}
export async function savePosMenuItemAction(input: unknown) {
  try { const item = await savePosMenuItem(await requirePosActor(true), input); refresh(item.eventId); return { ok: true as const, item }; } catch (error) { return failure(error); }
}
export async function reorderPosMenuAction(input: unknown) {
  try { const eventId = await reorderPosMenu(await requirePosActor(true), input); refresh(eventId); return { ok: true as const }; } catch (error) { return failure(error); }
}
export async function logDrinksAction(input: unknown) {
  try { const actor = await requirePosActor(); const logs = await logPosDrinks(actor, singleDrinkInputSchema.parse(input)); if (logs[0]) refresh(logs[0].eventId); return { ok: true as const, logs }; } catch (error) { return failure(error); }
}
export async function voidDrinkLogAction(input: unknown) {
  try { const log = await voidPosDrinkLog(await requirePosActor(), input); refresh(log.eventId); return { ok: true as const }; } catch (error) { return failure(error); }
}
export async function correctDrinkLogAction(input: unknown) {
  try { const log = await correctPosDrinkLog(await requirePosActor(), input); refresh(log.eventId); return { ok: true as const }; } catch (error) { return failure(error); }
}

export async function refreshPosMenuAction(eventId: string) {
  try { const menu = await getPosMenu(await requirePosActor(), eventId); return { ok: true as const, menu }; } catch (error) { return failure(error); }
}
