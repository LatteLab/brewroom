import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireInventoryAdmin } from '@/lib/inventory-access';
import { getRecipeWithStock } from '@/lib/db/inventory-queries';
import { RecipeEditor } from '@/components/inventory/recipe-editor';
export const dynamic = 'force-dynamic';

export default async function RecipePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const actor = await requireInventoryAdmin(); const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const data = await getRecipeWithStock(actor, id); if (!data) notFound();
  const stock = data.items.map(item => ({ name: item.name, unit: item.unit, onHand: item.onHand, costPerUnit: item.costPerUnit }));
  return <RecipeEditor recipe={data.recipe} stock={stock} linked={data.linked} startEditing={(await searchParams).edit === '1'} />;
}
