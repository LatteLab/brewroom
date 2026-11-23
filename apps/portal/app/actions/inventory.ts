'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { PosError } from '@/lib/pos';
import { requirePosActor } from '@/lib/pos-access';
import { createInventoryItem, deleteInventoryItem, saveMenuIngredients, updateInventoryCount } from '@/lib/db/inventory-queries';

function failure(error: unknown) {
  if (error instanceof z.ZodError) return { ok: false as const, error: error.issues.map(issue => issue.message).join(' ') };
  if (error instanceof PosError) return { ok: false as const, error: error.message };
  console.error('Inventory operation failed', error);
  return { ok: false as const, error: 'Could not save. Try again.' };
}
function refreshStock() { revalidatePath('/admin/inventory'); revalidatePath('/admin/pos', 'layout'); }

export async function createInventoryItemAction(input: unknown) {
  try { const item = await createInventoryItem(await requirePosActor(), input); refreshStock(); return { ok: true as const, item }; } catch (error) { return failure(error); }
}
export async function updateInventoryCountAction(input: unknown) {
  try { const item = await updateInventoryCount(await requirePosActor(), input); refreshStock(); return { ok: true as const, item }; } catch (error) { return failure(error); }
}
export async function deleteInventoryItemAction(input: unknown) {
  try { await deleteInventoryItem(await requirePosActor(), input); refreshStock(); return { ok: true as const }; } catch (error) { return failure(error); }
}
export async function saveMenuIngredientsAction(input: unknown) {
  try {
    const lines = await saveMenuIngredients(await requirePosActor(), input);
    const { eventId } = input as { eventId: string }; revalidatePath(`/admin/pos/${eventId}`);
    return { ok: true as const, lines };
  } catch (error) { return failure(error); }
}
