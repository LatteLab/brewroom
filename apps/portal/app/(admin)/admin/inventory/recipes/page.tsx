import { requireInventoryAdmin } from '@/lib/inventory-access';
import { listRecipes } from '@/lib/db/inventory-queries';
import { RecipeList } from '@/components/inventory/recipe-list';
import posStyles from '@/components/pos/pos.module.css';
export const dynamic = 'force-dynamic';

export default async function RecipesPage() {
  const recipes = await listRecipes(await requireInventoryAdmin());
  return <section className={posStyles.section} aria-labelledby="recipes-heading">
    <h2 id="recipes-heading">Recipe book</h2>
    <p className={posStyles.muted}>Recipes are written and tested as drafts. Publishing puts a recipe in the book and makes it available to link to a POS drink. Stock usage and event plans always use the published version, so editing a recipe never changes what an event is about to pour until you publish again.</p>
    <RecipeList recipes={recipes} />
  </section>;
}
