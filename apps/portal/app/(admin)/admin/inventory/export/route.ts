import { requireInventoryAdmin } from '@/lib/inventory-access';
import { getExportData } from '@/lib/db/inventory-queries';
import { buildBundle, inventoryToCsv } from '@/lib/inventory';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  let actor; try { actor = await requireInventoryAdmin(); } catch { return new Response('Administrator access is required.', { status: 403 }); }
  const { items, equipment, recipes } = await getExportData(actor);
  const stamp = new Date().toISOString().slice(0, 10);
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
  if (new URL(request.url).searchParams.get('format') === 'csv') {
    return new Response(inventoryToCsv(items), { headers: { ...headers, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="latte-lab-inventory-${stamp}.csv"` } });
  }
  const bundle = buildBundle(items, equipment.map(({ name, category, quantity, status, location, custodian, serial, notes, lastCheckedAt }) => ({ name, category, quantity, status, location, custodian, serial, notes, lastCheckedAt })), recipes);
  return new Response(JSON.stringify(bundle, null, 2), { headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="lattelab-data-${stamp}.json"` } });
}
