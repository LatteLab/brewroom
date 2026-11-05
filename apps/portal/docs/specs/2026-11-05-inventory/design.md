# Inventory tab, synchronized with POS drink logging

Date: November 5, 2026. This merges the prototype at [LatteLab/inventory-system-draft](https://github.com/LatteLab/inventory-system-draft) (commit `af76533`, v1.5.0) into the portal as an admin tab. See the [implementation plan](implementation-plan.md) for delivery and verification, and the [drink analytics design](../2026-10-29-drink-analytics/design.md) for the POS contract this builds on.

## Purpose

The prototype is a static claude.ai artifact with its own document store: a recipe book with draft/published versions, a stock count kept as sealed bags plus an open bag, an equipment register, and event planning that totals ingredient demand. It has no link to what is actually poured. The POS tab records every drink, with its temperature, milk, syrup and ice choices, but knows nothing about ingredients. The POS design anticipated this join: "Inventory can attach recipes to stable menu items later."

This feature adds `/admin/inventory` so that:

- a POS menu drink can be linked to a published recipe,
- every valid POS log deducts the recipe's ingredients from a stock estimate, applying that order's actual choices,
- an event's planned servings produce a demand table and shopping list against current stock, and
- the event shows what its recorded orders actually used.

## Non-invasive boundary

- New tables only, all prefixed `inventory_`. No POS table, query, action or validation changes. POS logging, corrections, voids and analytics run exactly as before.
- Inventory **reads** `pos_events`, `pos_event_menu_items` and `pos_drink_logs`. It never writes to them.
- `inventory_menu_links` references `pos_event_menu_items (event_id, id)` with `ON DELETE CASCADE`, so the existing POS event deletion transaction keeps working unchanged.
- The only edits to existing UI are a sidebar entry and one "Inventory plan" link in the POS event page's section nav.
- Inventory does not keep its own event list. The prototype's `events` collection is replaced by POS events, which are the club's events of record for drinks.

## Data model

| Table | Purpose |
| --- | --- |
| `inventory_items` | Name (unique key recipes refer to), category, unit (`ml`/`g`/`each`), bag size, sealed bags, open bag, `counted_at`, par, cost per unit, supplier, notes, `version` |
| `inventory_recipes` | Unique `slug`; `published` and `draft` JSONB bodies; `published_version`; `version` for optimistic concurrency |
| `inventory_equipment` | Name, category, quantity, status (`ok`/`repair`/`loaned`/`missing`/`retired`), location, custodian, serial, notes, last checked, `version` |
| `inventory_menu_links` | One row per POS menu item: `recipe_id` (nullable, `SET NULL` on recipe delete) and `planned_servings` |

All four tables enable RLS and revoke direct `anon`/`authenticated` access, matching the POS migration. Server code uses the existing connection.

Rules kept from the prototype:

- **Quantity on hand is derived, never stored**: `bag_size × sealed_bags + open_bag`.
- **Units are never converted.** A recipe line uses its inventory item's unit.
- **Two recipe bodies.** Editing writes `draft`; only **Publish** changes what POS usage and plans use. Unpublishing returns the content to draft and stops linked drinks counting.
- **Recipes refer to items by name**, which keeps the exchange format readable. The prototype's known weakness (a rename orphans recipes) is fixed: renaming an item rewrites references in every recipe body in the same transaction.
- **Import never deletes.** Inventory and equipment match by name, recipes by slug.

## Recipes respond to POS configurations

Prototype recipes describe one fixed drink. A POS drink is configured per order, so each recipe line gains two fields, defaulting to the prototype's behavior:

| Field | Values | Effect for one drink |
| --- | --- | --- |
| `when` | `always`, `hot`, `iced`, `whole`, `oat` | Line applies only to matching temperature or milk |
| `scale` | `fixed`, `syrup`, `ice` | `syrup`: qty × syrup% / 100. `ice`: qty × 0 / ½ / 1 for none / light / full, and 0 for hot drinks |

Example: a latte lists whole milk (`whole`), oat milk (`oat`), syrup (`syrup`), ice (`iced`, `ice`), hot cup and lid (`hot`), cold cup and straw (`iced`). Double espresso is fixed in POS, so beans are a plain `always` line.

## Stock estimate

`counted_at` is set whenever someone records a count (always on **Save count**, and on any edit or import that changes the bag numbers). For each item:

```
estimated on hand = counted − Σ usage from valid POS logs recorded after counted_at
```

Usage is computed on read from logs whose `voided_at` is null, so voids and corrections are reflected immediately and nothing needs reconciling. SQL groups the logs by drink, configuration and the count interval they fall in, so a read returns counts × drinks × configurations rows rather than every drink ever logged. The ingredient rules stay in tested TypeScript (`lib/inventory.ts`). Corrections keep the original `recorded_at`, so they stay on the correct side of a count. Recounting resets the baseline. The estimate can go negative; the UI flags that as "recount".

## Event planning

The event page lists the POS menu live (archived drinks remain only if they have valid orders). For each drink an admin chooses a published recipe and planned servings. Demand uses each drink's **default configuration**, because the real hot/iced and milk mix is unknown before service. Rows show needed versus estimated on hand, and shortfalls round up to whole sealed bags. Planned drinks without a recipe, or with an unpublished one, are named in a banner rather than dropped silently. **Recorded usage** applies each valid log's real configuration to the linked recipe.

## Access

Admin only, the same audience as POS, which is itself admin-only. Every query function, server action and the export route checks it.

## Exchange format

Import and export use the prototype's `lattelab-data` version 1 bundle and its inventory CSV columns unchanged. The prototype's real `exchange/bundle.json` (40 items, 38 equipment, 22 recipes) imports with no skipped rows. Exports add `when` and `scale` to ingredients; the format allows new fields without a version bump. Guidelines are counted and ignored on import.

## Assumptions to confirm

1. **Admin-only.** Counting is often done by baristas at the cart; letting non-admin members record counts would be a separate access decision.
2. **Ice factors** none/light/full = 0 / 0.5 / 1 of the recipe's ice amount, and syrup scales linearly with 50/75/100%.
3. **Plans use menu defaults.** An alternative is planning from the historical configuration mix.
4. **Usage uses the current published recipe**, as in the prototype, not the version in force when each drink was logged. Publishing a change re-estimates drinks logged since each item's last count. Recount after an event to lock in reality.
5. **Deleting a POS event removes its orders from usage**, as it already removes them from analytics, so the estimate rises until the next recount.
6. **Prototype recipes import as "every drink, fixed amount".** Milk, cup, syrup and ice lines need reviewing after import, or a hot, whole-milk recipe will charge whole milk to oat orders.
7. **Slugs are fixed at creation.** Renaming a recipe keeps its slug, so re-importing a bundle updates it instead of duplicating it. The prototype derived slugs from the current name.

## Out of scope (prototype features not ported yet)

- **Deadline templates** (`templates/*.md`: Café-Style, Workshop, Showcase, Boothing) and per-event milestone tracking.
- **Per-event kit lists and equipment clash detection.** The equipment register is ported, but nothing yet assigns kit to POS events.
- The prototype's **spreadsheet generators** (`tools/*.py`) and live multi-viewer editing. The portal uses optimistic versions: stale edits are rejected with a refresh message.
