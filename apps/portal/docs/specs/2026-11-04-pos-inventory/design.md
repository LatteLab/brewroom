# POS stock and ingredient usage

Date: November 4, 2026. Proposal. Nothing here is applied to a shared database until a release record says so.

Builds on the [POS design](../2026-10-29-drink-analytics/design.md). The internal inventory-system-draft informed the idea; this is a deliberately small subset.

## Purpose

Admins keep a list of supplies with an on-hand amount, list the ingredients for each POS menu drink, and see roughly how much of each supply an event's logged drinks used.

Stock changes only when an admin edits it. Logging, voiding, or correcting a drink never changes stock. Usage is derived from valid drink logs when the event page loads; no counters are stored.

## Out of scope

Automatic deduction, shared recipes across events, bag counting, costs, categories, stock history, drinks-remaining estimates, imports, and equipment.

## Data

`inventory_items`: `name` (unique, nonblank), `unit` (`ml`, `g`, or `each`), `on_hand` (≥ 0), `low_at` (≥ 0), `updated_at`, `updated_by`, `version`. Status is **Out** at zero or less, **Low** below `low_at`, otherwise **OK**.

`pos_menu_ingredients`: `menu_item_id`, `item_id`, `quantity` per drink (> 0), `applies_when` (`always`, `hot`, `iced`, `whole`, `oat`), `scales_with_syrup`, `sort_order`. Both foreign keys restrict deletion. A stock item used by any drink cannot be deleted.

Ingredients belong to one event's menu drink, like the rest of the menu. Saving a drink's ingredients replaces its lines under the event lock and does not change the drink's menu `version`, so an open kiosk keeps working. Deleting a POS event deletes its ingredient lines with its menu.

Both tables enable RLS and revoke `anon` and `authenticated` access, matching POS.

## Usage estimate

For each valid log, take its drink's ingredient lines whose condition matches the logged configuration and add `log quantity × line quantity × (syrup ÷ 100 when scaled)`. Group by stock item and show it beside current on-hand. Logged drinks without ingredients are listed by name rather than guessed. Ingredient edits change the estimate for past logs too.

## Pages

- `/admin/inventory` lists items with on hand, low level, and status, and adds or deletes items. On hand and low level save from the row.
- Each drink in the POS menu editor gains an Ingredients section.
- The POS event page gains an Estimated usage section.
- The admin sidebar links to Inventory.

All of it requires a Portal admin, using the POS actor check.

## Database change

One additive migration. No existing row changes. Follow [database migrations](../../database-migrations.md) before applying it anywhere shared.
