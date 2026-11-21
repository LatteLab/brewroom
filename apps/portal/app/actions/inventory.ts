'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { InventoryError, csvToInventory } from '@/lib/inventory';
import { requireInventoryAdmin } from '@/lib/inventory-access';
import {
  countInventoryItem, createRecipe, deleteEquipment, deleteInventoryItem, deleteRecipe, discardRecipeDraft, importBundle, importInventoryItems,
  publishRecipe, saveEquipment, saveInventoryItem, saveMenuLink, saveRecipeDraft, unpublishRecipe,
} from '@/lib/db/inventory-queries';
import { importBundleSchema, importCsvSchema } from '@/lib/validations/inventory';

function failure(error: unknown) {
  if (error instanceof z.ZodError) return { ok: false as const, error: error.issues.map(issue => issue.message).join(' ') };
  if (error instanceof InventoryError) return { ok: false as const, error: error.message };
  console.error('Inventory operation failed', error);
  return { ok: false as const, error: 'Could not confirm the change. Refresh and try again.' };
}
// Stock estimates depend on recipes, links and counts together, so every write refreshes the whole tab.
function refresh() { revalidatePath('/admin/inventory', 'layout'); }

export async function saveInventoryItemAction(input: unknown) {
  try { const item = await saveInventoryItem(await requireInventoryAdmin(), input); refresh(); return { ok: true as const, item }; } catch (error) { return failure(error); }
}
export async function countInventoryItemAction(input: unknown) {
  try { const item = await countInventoryItem(await requireInventoryAdmin(), input); refresh(); return { ok: true as const, item }; } catch (error) { return failure(error); }
}
export async function deleteInventoryItemAction(input: unknown) {
  try { await deleteInventoryItem(await requireInventoryAdmin(), input); refresh(); return { ok: true as const }; } catch (error) { return failure(error); }
}
export async function importInventoryCsvAction(input: unknown) {
  try {
    const actor = await requireInventoryAdmin(); const { text } = importCsvSchema.parse(input);
    const parsed = csvToInventory(text);
    if (!parsed.items.length) return { ok: false as const, error: parsed.errors.join(' ') || 'No rows found.' };
    const result = await importInventoryItems(actor, parsed.items); refresh();
    return { ok: true as const, ...result, skipped: parsed.errors };
  } catch (error) { return failure(error); }
}
export async function saveEquipmentAction(input: unknown) {
  try { const item = await saveEquipment(await requireInventoryAdmin(), input); refresh(); return { ok: true as const, item }; } catch (error) { return failure(error); }
}
export async function deleteEquipmentAction(input: unknown) {
  try { await deleteEquipment(await requireInventoryAdmin(), input); refresh(); return { ok: true as const }; } catch (error) { return failure(error); }
}
export async function createRecipeAction(input: unknown) {
  try { const recipe = await createRecipe(await requireInventoryAdmin(), input); refresh(); return { ok: true as const, recipe }; } catch (error) { return failure(error); }
}
export async function saveRecipeDraftAction(input: unknown) {
  try { const recipe = await saveRecipeDraft(await requireInventoryAdmin(), input); refresh(); return { ok: true as const, recipe }; } catch (error) { return failure(error); }
}
export async function publishRecipeAction(input: unknown) {
  try { const recipe = await publishRecipe(await requireInventoryAdmin(), input); refresh(); return { ok: true as const, recipe }; } catch (error) { return failure(error); }
}
export async function discardRecipeDraftAction(input: unknown) {
  try { const recipe = await discardRecipeDraft(await requireInventoryAdmin(), input); refresh(); return { ok: true as const, recipe }; } catch (error) { return failure(error); }
}
export async function unpublishRecipeAction(input: unknown) {
  try { const recipe = await unpublishRecipe(await requireInventoryAdmin(), input); refresh(); return { ok: true as const, recipe }; } catch (error) { return failure(error); }
}
export async function deleteRecipeAction(input: unknown) {
  try { await deleteRecipe(await requireInventoryAdmin(), input); refresh(); return { ok: true as const }; } catch (error) { return failure(error); }
}
export async function saveMenuLinkAction(input: unknown) {
  try { const link = await saveMenuLink(await requireInventoryAdmin(), input); refresh(); return { ok: true as const, link }; } catch (error) { return failure(error); }
}
export async function importBundleAction(input: unknown) {
  try {
    const actor = await requireInventoryAdmin(); const { text } = importBundleSchema.parse(input);
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch (error) { return { ok: false as const, error: `That is not valid JSON: ${(error as Error).message}` }; }
    const result = await importBundle(actor, parsed); refresh();
    return { ok: true as const, ...result };
  } catch (error) { return failure(error); }
}
