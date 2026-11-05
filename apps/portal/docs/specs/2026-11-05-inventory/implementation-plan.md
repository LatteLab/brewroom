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

## Verification record

- `pnpm --filter @lattelab/portal test:inventory`: 7 pass.
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
