# Implement the inventory tab

Date: November 5, 2026. Implements the [design](design.md). Paths are relative to `apps/portal`; run commands from the Brewroom root.

## Work

- [x] Read the prototype (`schema.js`, `store.js`, `ui.js`, `app.js`, `docs/`, `templates/`, seed data) and the POS feature (schema, queries, actions, kiosk, specs, tests).
- [x] `lib/validations/inventory.ts`: Zod schemas for items, recipe bodies (with `when`/`scale`), equipment, links and bundle rows.
- [x] `lib/inventory.ts`: pure rules ported from `schema.js` plus configuration-aware usage, event plans, CSV and bundle read/build.
- [x] `lib/db/schema.ts` and `lib/db/migrations/20261105120000_inventory.sql`: four additive `inventory_` tables with RLS and revoked direct grants.
- [x] `lib/db/inventory-queries.ts`: admin-checked reads in repeatable-read snapshots; writes with optimistic versions; rename cascade; event-first `FOR SHARE` lock when linking.
- [x] `lib/inventory-access.ts` and `app/actions/inventory.ts`: admin session check on every action.
- [x] Pages under `app/(admin)/admin/inventory/`: Stock, Recipes, recipe card, Event planning, event detail, Equipment, Import / export, and the `export` route (JSON or `?format=csv`).
- [x] `components/inventory/`: stock table, dialogs, recipe editor, menu link rows, import form; phone tables collapse into labelled cards.
- [x] Sidebar entry and POS event page link.
- [x] Tests: `tests/inventory.test.ts` (domain) and `tests/inventory-db.test.ts` (real PostgreSQL). `tests/pos-db.test.ts` now drops inventory tables before its reset, because they reference POS tables.

## Follow-up: purchase options, name matching and running-low warnings

- [x] `inventory_item_packages`: one ingredient, many purchase options priced per bag; cost per unit derived and weighted by sealed stock. Migration edited in place because it has not been applied anywhere.
- [x] Item dialog edits purchase options; the stock table counts sealed bags per option plus one open amount.
- [x] POS drinks resolve their recipe by name (`resolveDrinkRecipes`), with pin and don't-track overrides (`inventory_menu_links.track`).
- [x] `drinkCapacity` / `drinkWarnings` and `DrinkWarnings`: warning at 20 or fewer, on the kiosk (`notice` prop, errors caught), event page and Stock page.
- [x] CSV with one row per purchase option; bundle keeps the prototype single-bag shape and adds `costPerBag` and `packages`.

## Follow-up: end-to-end run, drinks-you-can-make, decluttering

- [x] Ran the whole workflow in the browser on an empty disposable database: seven items with purchase options, a seven-line recipe published from the editor, a POS event and drink created in POS, four kiosk orders and one removal. Every item's on-hand matched a hand calculation after the orders and after the removal.
- [x] `drinkCapacity` reports drinks left per drink type with the first ingredient to run out; shown on the event page, the Stock page (current or next event) and recipe cards, and used by the warnings.
- [x] Decluttered: one-line summaries instead of stat grids, empty sections collapse to a sentence, a five-column stock table, and the recipe card's misleading batch scaler removed.

## Verification record

- After the follow-up: `test:inventory` 10 pass, `test:inventory:db` 8 pass, `test:pos` 8 pass, `test:pos:db` 17 pass. Lint has no errors (5 existing warnings). Migration and `drizzle-kit push` DDL match. The real prototype bundle converts with identical quantities and costs per unit. In the browser, a drink named like a recipe deducted with no setup, a count of 3,000 ml whole milk raised "About 15 Vanilla Latte left" on the Stock page and kiosk, and logging one drink in the kiosk changed it to 14.
- `pnpm --filter @lattelab/portal test:inventory`: 7 pass (first version).
- `test:inventory:db` and `test:pos:db` against a disposable loopback `lattelab_pos_integration` (PostgreSQL 14): 5 and 16 pass. These include POS event deletion and concurrency with the new cascade FK in place.
- `test:pos`: 8 pass. `lint`: no errors (5 existing warnings elsewhere). `typecheck`: passes.
- `build` passes with placeholder environment values. Without them it stops at the existing email page for lack of a Resend key, as the README notes.
- DDL from the SQL migration and from `drizzle-kit push` of `schema.ts` were compared on disposable databases and match.
- Browser check on a disposable database with a local test admin: imported the prototype bundle, linked a POS drink, planned servings, edited and published a recipe with milk/syrup/cup rules, logged a drink in the real kiosk, saw it deducted from Stock, recounted, and checked phone (375 px) and desktop layouts without horizontal overflow.

## Release steps (not done)

1. Review and apply `lib/db/migrations/20261105120000_inventory.sql` to the target following [database migrations](../../database-migrations.md), after the three POS migrations. It only creates tables.
2. Export the live prototype's data (Import / export → Export data in the artifact) and import it on the portal's Import / export page.
3. Review imported recipes' milk, cup, syrup and ice lines, then publish them.
4. Link each POS event's drinks to recipes and record a fresh count before the next event.
