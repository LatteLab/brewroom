# Event drink logging and analytics

Date: October 29, 2026. Implemented and verified in an isolated feature checkout with disposable local PostgreSQL. Browser flows, tests, typecheck, lint, and production build passed. Not deployed.

See the [implementation plan](implementation-plan.md) for delivery steps and the [portal documentation index](../../README.md) for current guides.

## Purpose

Staff record an order as it is received, then review drink totals and order activity for that event. Staff also create events and edit menus through the portal, without changing source code.

This version excludes inventory, payments, pre-orders, customer accounts, registration, lotteries, preparation tracking, and handoff tracking. Inventory can attach recipes to stable menu items later. It does not need tables or ingredient quantities now.

## Accepted requirements

- An event has a name and a start and end date/time window.
- Eastern time is the default. Use `America/New_York` for entry and display, with no timezone picker initially.
- Events have no stored draft, live, or closed status. Date filters derive from the time window.
- `recorded_at` is the only order-time metric. It means when staff first record an order as received.
- Staff do not enter a serving time or backdate a recorded timestamp.
- Staff configure drink names, available choices, and defaults through forms.
- The initial menu has Pumpkin Spice Latte and Apple Cider Latte.
- Options are Hot/Iced, Whole/Oat milk, 50/75/100 percent syrup, and iced-only None/Light/Full ice. Espresso is fixed double.
- An MIT kerb is optional. A blank kerb never blocks an order and does not require a customer user record.
- Reports show event drink totals, configuration breakdowns, and time spikes in recorded order activity.

The technical choices below describe the feature implementation. They do not establish a production deployment.

## Existing system and feature boundary

The current [event schema](../../../lib/db/schema.ts) requires capacity and includes registration, approval, waitlist, plus-one, invitation, and lottery settings. Its [server actions](../../../app/actions/events.ts) coordinate those workflows. The new feature does not reuse their validators or lifecycle actions.

Reuse portal authentication, Zod validation, and the existing Drizzle/Postgres connection. Keep the feature in `apps/portal` and its current deployment. The public Cafe app does not need internal drink records.

At planning time, main did not contain `/kiosk` and the earlier temporary prototype was unavailable. The feature rebuilds its approved full-screen behavior and connects it to authenticated server/database operations.

## Three tables

Use `pos_events`, `pos_event_menu_items`, and `pos_drink_logs` while the old registration system remains. The prefix prevents a naming collision, not a permanent domain requirement.

| Table | Proposed fields |
| --- | --- |
| `pos_events` | UUID `id`, `name`, `starts_at`, `ends_at`, creator, creation/update timestamps |
| `pos_event_menu_items` | UUID `id`, `event_id`, `name`, JSONB option definitions/defaults, `available`, `sort_order`, `version` |
| `pos_drink_logs` | UUID `id`, `event_id`, `menu_item_id`, `menu_version`, name/specification snapshots, positive `quantity`, `submission_id`, `line_index`, `request_hash`, `recorded_at`, recorder, optional `kerb`, void and replacement metadata |

An event requires a nonblank name and `ends_at > starts_at`. Its timestamps use `timestamptz`. No separate date, event timezone, or event-status column is needed initially.

A menu item belongs to one event. Its options use the supported groups rather than an arbitrary questionnaire or rule language. JSONB preserves that configuration while Zod validates its shape. A new drink or supported choice needs a form edit. A new customization dimension requires an intentional code change.

Each drink log stores one selected configuration and its quantity. Differently customized drinks produce separate rows. The server copies the authoritative drink name and specifications into the log, including fixed double espresso. Names are never relational keys. Menu edits do not change old snapshots.

Require a menu-item/event foreign key match and positive integer quantities. Restrict deletion of events and menu items with log history. Keep menu availability separate from event lifecycle; an unavailable drink can remain visible in historical reports.

Start with indexes on menu event/sort order and valid logs by event/recorded time. Add indexes only for actual report queries. Do not store separate mutable report counters.

## Event window and Eastern time

Interpret form dates in `America/New_York`, then store resolved instants. Display labels in Eastern regardless of the operator's browser timezone. Do not assume a fixed UTC offset. Reuse the portal date-handling approach after checking its daylight-saving behavior. A dedicated `pos-time.ts` module is not a prerequisite.

The window groups and labels events. It is not an automatic permission expiry. Proposed behavior outside that window is a confirmation before logging, with the true current `recorded_at`. Admins can edit a window if service runs late. No scheduled close job runs.

Delayed entries remain delayed records. Neither the UI nor reports claim they reveal the original arrival time. No manual backfill-time field is included.

## Save and retry contract

One submission means one order entered by staff. Its drink rows share a `submission_id`, with a zero-based `line_index`. This separates drink count from order count without an orders table.

The kiosk retains one submission ID through a save or retry. The server validates permission, event/menu membership, expected menu versions, choices, quantities, and optional kerb. Hot drinks cannot carry ice. A blank kerb is stored as null.

Insert all lines in one transaction. Assign one server/database `recorded_at` to the original submission. Snapshot names and selected specifications on the server. Clear the entry only after success and keep it on failure.

Protect original submissions with a unique `(event_id, submission_id, line_index)` index limited to rows without `replaces_log_id`. Store a hash of the canonical validated request on each original row. A retry returns the original result only when the event, operator, line set, and request hash match. Reuse of an ID with different contents fails.

Check an existing submission before applying new menu-version or availability checks. Otherwise an accepted order could become impossible to retry after a menu edit. Distinct submission IDs remain distinct orders even when all drinks match.

## Corrections preserve order history

Original request rows and timestamps remain intact. Undo sets void metadata with actor, reason, and operation time. Correcting an entry atomically voids its current row and inserts a replacement linked by `replaces_log_id`.

The replacement preserves the original `submission_id`, `line_index`, `recorded_at`, and recorder. Its new UUID and unique correction `mutation_id` identify the correction operation. The old row's void metadata records when and by whom the correction occurred. No client can supply an arbitrary order timestamp.

Allow only one replacement per row with a unique non-null `replaces_log_id`. Lock the current row and require that it is not already voided. Repeated mutation IDs return the prior correction result. These rules prevent concurrent corrections from producing two valid replacements.

Reports read only non-voided rows. Correcting a quantity or milk choice changes totals and breakdowns without moving the order into the correction-time bucket. Order count is distinct valid `submission_id`; an order whose lines are all voided is excluded.

## Actions, queries, and access

Server actions authenticate, validate client input, check permissions, invoke query/transaction functions, and return useful errors. Database functions own inserts, row locks, transactions, and report queries. Server-rendered pages can read those functions directly after checking access.

Proposed operations are event creation/update, menu saving, drink logging, void/correction, and analytics/export reads. Keep them in `app/actions/pos.ts`, `lib/db/pos-queries.ts`, and `lib/validations/pos.ts`. Do not add an API app, event bus, or pass-through service layer.

Admins manage event setup and reports. Only explicitly eligible POS staff can log drinks and use the permitted recent-log controls. Membership alone does not grant access. Set the server-only comma-separated `POS_STAFF_EMAILS` allowlist for cashier access; admins retain access. Check eligibility on every server entry point. Staff can view and correct only their own logs. Do not grant blanket admin access to cashiers.

## Staff interface and reports

Proposed portal routes are `/admin/pos`, `/admin/pos/new`, and `/admin/pos/[eventId]`. The event page contains setup, menu, recent logs, and analytics. `/kiosk` selects a permitted event; `/kiosk/[eventId]` keeps order entry full-screen.

Staff can rename drinks, choose supported options/defaults, reorder items, and mark items unavailable within an event. Drag handles set kiosk order and save automatically; focused handles also support up and down arrow keys. Numeric positions are internal, and new drinks append to the menu. Reordering checks the complete event menu and its previous order under the event lock, so a stale editor cannot overwrite a newer order. It does not change drink configuration versions. Copying menus between events is out of scope. The kiosk defaults to one drink and supports multiple configured lines per submission. Disable repeat clicks while a save is pending, but rely on database uniqueness for retry protection.

Reports use one valid-log dataset for screen and CSV. They calculate:

- Total drinks with `SUM(quantity)` and total orders with distinct `submission_id`.
- Drink and option totals/percentages using snapshots.
- Five- or fifteen-minute buckets of `recorded_at`, with Eastern labels and zero-filled intervals. Very broad ranges are coarsened to at most about 5,000 buckets and show the actual interval.
- Peak recorded-order periods and within-window drinks per elapsed scheduled hour. The average is omitted before one minute has elapsed and excludes outside-window entries.
- Average time between consecutive distinct valid orders, using `recorded_at`. Count a multi-line order once. Include outside-window orders, omit voided orders, and show no value until two orders exist. This measures gaps in recorded order activity; it does not measure preparation or wait time.

Keep outside-window entries visible and include them in totals. Extend chart coverage to their buckets or identify them beside a window-filtered chart. Repeated daylight-saving hour labels retain their offset or underlying UTC bucket identity.

These reports do not establish drinks served, attendance, unique customers, revenue, arrivals, or waiting time. Optional kerbs are incomplete, self-reported identifiers.

## Delivery and later cleanup

Build event/menu setup, persistent order logging/corrections, then analytics/export. Run a mock event before release. Start inventory only after that workflow works for staff.

Rename the three tables to `events`, `event_menu_items`, and `drink_logs` only in a separate legacy-event retirement change. That change must remove old registration code/dependencies, update Drizzle references, and review the data migration together. No deletion of legacy data is authorized by this specification or documentation task.

## Checks and unresolved decisions

Verify Eastern date conversion, option validation, retry payload matching, simultaneous operators, stale menus, correction races, preserved timestamps, and matching report/CSV totals. Check logger and admin screens on phone and tablet.

Before deployment, configure real staff eligibility and verify the browser flows against the intended development target. Recipe quantities, event-registration retirement, deployment, and offline order queues remain outside this implementation request.


## Local verification record

The implementation uses an additive SQL migration, RLS with no direct anonymous/authenticated grants, and an explicit loopback-only SSL override for disposable development databases. The existing registration tables and flows remain intact.

`pnpm --filter @lattelab/portal test:pos` passes seven domain tests. `POS_TEST_DATABASE_URL` plus `pnpm --filter @lattelab/portal test:pos:db` passes eight tests against real disposable PostgreSQL, including concurrent submissions, correction retries/races, preserved timestamps, constraints, RLS, stale menus, menu reordering, and permissions. Browser flows, typecheck, lint, and the production build passed. No shared database has been changed. See the implementation plan for verification details and external-service limits.
