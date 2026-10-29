# Implement event drink logging and analytics

Date: October 29, 2026. Implementation is present in the feature checkout. Only disposable local databases were used; no shared database or deployment was changed.

Implement the [design](design.md). Use the [portal documentation index](../../README.md) and [portal setup guide](../../../README.md) for current commands and environment requirements.

## Hold the scope

- Implement manual order entry and per-event drink analytics in `apps/portal`.
- Use only immutable server-assigned `recorded_at` for order timing. Do not introduce serving or editable backfill times.
- Default all event entry and display to `America/New_York` without a timezone picker.
- Derive event date filters from start/end timestamps. Do not add event lifecycle status or automatic close jobs.
- Keep legacy registration data/code intact. Use temporary `pos_` table names.
- Exclude inventory, payments, preparation queues, general customer accounts, and offline synchronization.

All proposed source paths below are relative to `apps/portal`. Run package commands from the Brewroom root.

## 1. Confirm the source and access boundary

- [x] Read the root/app instructions and confirm the current branch and working-tree changes.
- [x] Locate a verified source for the earlier kiosk or rebuild its approved visual behavior. Current main has no `/kiosk`, and the old scratch checkout is unavailable.
- [x] Confirm the first operators and define a narrow POS-eligibility check. Reuse the existing admin whitelist for setup/report access.
- [x] Inspect `auth.ts`, `proxy.ts`, `types/next-auth.d.ts`, and the current user-query helpers before adding that check.
- [x] Specify logger permissions for recent entries and corrections. Keep admin correction access explicit.
- [x] Confirm an isolated development database target before preparing or applying schema changes.

Acceptance: the source to reuse and server-side staff-access rule are known. No production credentials, databases, or legacy records are changed.

## 2. Define validation and the three-table schema

Files: modify `lib/db/schema.ts`; create `lib/validations/pos.ts`.

- [x] Define nonblank event names, Eastern start/end inputs, and an end-after-start rule without a future-only creation restriction.
- [x] Add `pos_events` with UUID ID, name, start/end `timestamptz`, creator, and creation/update metadata.
- [x] Add `pos_event_menu_items` with event FK, name, option/default JSONB, availability, sort order, and version.
- [x] Define supported option groups in one schema. Derive form defaults and server checks from that definition.
- [x] Fix espresso at double. Validate Hot without an ice value and Iced with a valid ice value.
- [x] Add `pos_drink_logs` with the fields and correction rules in the design. Keep optional kerb separate from member identity.
- [x] Add positive-quantity checks and a composite event/menu FK so cross-event menu IDs cannot be logged.
- [x] Add unique original submission-line, correction-mutation, and non-null replacement-target constraints.
- [x] Restrict deletion of referenced events/menu items. Add event/recorded-time and menu/event-sort indexes.
- [x] Derive persisted types from Drizzle and input types from Zod. Do not duplicate the same option list across files.
- [x] Prepare a reviewed additive migration using the repository's schema workflow. Do not run `db:push` as installation or build work.
- [x] If new tables are in an exposed schema, configure explicit access policies. Browser clients must not gain direct unrestricted writes.

Acceptance: a development migration adds only the new POS structures and needed access change. Invalid quantities and cross-event references fail. The old event tables remain unchanged.

## 3. Add transaction functions and authenticated actions

Files: create `lib/db/pos-queries.ts` and `app/actions/pos.ts`; update existing auth helpers only as required.

- [x] Add event/menu reads and writes with optimistic version checks for menu edits.
- [x] Export authenticated actions for create/update event, save menu item, log drinks, void log, and correct log.
- [x] Keep server-side read authorization in pages and export handlers. A read does not become public merely because it is not a mutation.
- [x] Implement `logDrinks` with event ID, stable submission ID, ordered drink lines, menu versions, and optional kerb.
- [x] Canonicalize the validated request and hash its semantic content for retry comparison.
- [x] Look for original submission rows first. Verify event, recorder, complete line set, and hash before returning an existing result.
- [x] For a new submission, validate current menu versions, availability, selections, and quantities inside the save transaction.
- [x] Construct name/specification snapshots from authoritative menu data. Never trust client-provided names or recorded timestamps.
- [x] Insert all lines atomically with one database-generated `recorded_at`. Concurrent identical retries converge to the original rows.
- [x] Return the original IDs and timestamp on retry. Reject reuse of a submission ID with different contents.
- [x] Trim kerb text and store blank as null. Do not claim an identity lookup or MIT affiliation check.
- [x] Return structured validation/conflict failures that let the kiosk retain the unsaved entry.

Proposed action shape:

```text
createPosEvent(input) -> event
updatePosEvent(eventId, input) -> event
savePosMenuItem(eventId, input, expectedVersion) -> menuItem
logDrinks(eventId, submissionId, lines, kerb?) -> savedLogs
voidDrinkLog(logId, reason) -> voidedLog
correctDrinkLog(logId, mutationId, replacement, reason) -> replacementLog
```

These are planning signatures. Define exact schemas and return types during implementation, without adding a pass-through service layer.

Acceptance: valid authorized submissions persist once. Different operators with distinct submissions both succeed. Invalid access, stale menus, and changed retry payloads fail without partial rows.

## 4. Implement corrections without moving order timestamps

Files: `lib/db/pos-queries.ts`, `app/actions/pos.ts`, and `lib/validations/pos.ts`.

- [x] Make undo a recorded void operation. Preserve the original snapshot and timestamp.
- [x] Correct a current log in one transaction by locking it, voiding it, and inserting one replacement.
- [x] Copy original event, logical submission/line identity, recorder, and `recorded_at` into the replacement.
- [x] Use a new correction mutation ID and record `replaces_log_id`. Keep actor/reason/time in the original row's void metadata.
- [x] Permit only one replacement for a row. Refuse stale concurrent correction attempts.
- [x] Return the saved correction for a repeated mutation ID after comparing its request contents.
- [x] Allow permitted corrections after an event ends. Do not accept a client-edited `recorded_at`.
- [x] Keep original retry-request rows immutable so an old network retry cannot restore or duplicate a voided order.

Acceptance: a correction changes drink quantities/specifications once while preserving the original order-time bucket and submission count. Every replaced value remains inspectable.

## 5. Build event and menu setup

Files: create route pages under `app/(admin)/admin/pos/` and domain components under `components/admin/pos/`.

- [x] Add `/admin/pos`, `/admin/pos/new`, and `/admin/pos/[eventId]` with the established admin layout and access checks.
- [x] Add event name and start/end controls labelled Eastern time. Reuse existing date controls after testing their conversion behavior.
- [x] Keep date filters derived. Do not add event-status forms, actions, or columns.
- [x] Add menu-item name, available choices, default choices, ordering, and availability controls.
- [x] Save menu order through drag handles with keyboard arrow support. Append new drinks automatically and reject stale or incomplete reorder requests.
- [x] Keep menu editing scoped to one event. Copying menus between events is out of scope.
- [x] Handle optimistic menu conflicts with an explicit refresh response instead of overwriting another editor's changes.
- [x] Preserve historical snapshots when an item is renamed or its options change.

Acceptance: an authorized team lead creates an event and both initial drinks without code edits. Existing portal events and email pages retain their behavior.

## 6. Connect the full-screen logger

Files: create `app/kiosk/page.tsx`, `app/kiosk/[eventId]/page.tsx`, and focused client components under `components/pos/`.

- [x] Make `/kiosk` an authorized event chooser and `/kiosk/[eventId]` the logger. Require access in both pages and all actions.
- [x] Load the event's menu/defaults from the server. Preserve drink customization, quantity, multi-line entry, and optional order-level kerb.
- [x] Generate one submission ID for the current order. Reuse it and unchanged payload through retries until a confirmed result.
- [x] Disable repeat clicks while pending. Keep an unsaved entry and visible failure message if the save fails.
- [x] Clear drinks and kerb only after confirmation. Generate a fresh submission ID for the next order.
- [x] Show recent logs with permitted void/correction controls and history.
- [x] Confirm before logging outside the event's planned window. Save the real current timestamp and identify the outside-window entry.
- [x] Keep mobile touch targets, labels, keyboard focus, and status announcements accessible.

Acceptance: staff record mixed Hot/Iced orders with or without kerb. Refresh preserves confirmed records. A failed request can be retried without inflating counts.

## 7. Add analytics and CSV from the same records

Files: `lib/db/pos-queries.ts`, the POS event page, analytics components, and an authenticated export handler.

- [x] Define one valid-log selection that excludes voided rows and includes current replacements.
- [x] Calculate drinks with `SUM(quantity)` and orders with distinct valid `submission_id`.
- [x] Show average time between distinct valid recorded orders. Multi-line submissions count once; fewer than two orders have no gap value.
- [x] Group drink and option breakdowns from saved snapshots, using stable IDs for identity.
- [x] Group `recorded_at` into five- or fifteen-minute real-time buckets with Eastern labels. Fill empty intervals with zero.
- [x] Keep totals and outside-window logs visible. Make any time-window filter explicit on both screen and export.
- [x] Distinguish repeated daylight-saving hour buckets by offset or UTC identity.
- [x] Export the same filtered rows with recorded timestamp, drink specifications, quantity, and permitted identity fields. Escape spreadsheet formula-like text in CSV.
- [x] Label reports as recorded-order activity. Do not label counts as served drinks, attendance, revenue, arrivals, or wait times.
- [x] Do not use PostHog or independently incremented counters as the event totals source.

Acceptance: chart totals, summaries, corrections, and CSV reconcile for a fixed mock-event dataset. One order containing two differently customized drinks counts as one order and two drinks.

## 8. Verify before release

Run `pnpm --filter @lattelab/portal test:pos` for domain tests and `POS_TEST_DATABASE_URL=<disposable-loopback-url> pnpm --filter @lattelab/portal test:pos:db` for transaction tests. The latter refuses any target except a loopback database named `lattelab_pos_integration`.

- [x] Test summer/winter Eastern conversion, DST boundaries, and end-after-start validation.
- [x] Test Hot/ice rejection, menu ownership, nonpositive quantities, blank kerb, and permission denial.
- [x] Test repeated and simultaneous submissions, payload mismatch, stale menu, all-or-nothing batches, and stable recorded timestamps.
- [x] Test void/correction retries and races, original history, unchanged time buckets, and valid order/drink totals.
- [x] Drive setup, order entry, retries, corrections, and reports in a mock event on phone/tablet, using administrator and cashier sessions. Verify concurrent requests in PostgreSQL tests.
- [x] Run `pnpm --filter @lattelab/portal lint`, then `pnpm --filter @lattelab/portal typecheck`, then `pnpm --filter @lattelab/portal build` from the root.
- [x] Record environment/service-related build limitations separately from feature failures. Never copy production secrets to make a test pass.
- [x] Run `git diff --check` and review the additive migration and access policies before release.

Implementation was authorized after this plan was written. The migration was applied only to disposable local databases. No shared database migration, release, registration retirement, or table rename was performed. Inventory remains a later feature.


## Implementation notes

- Initial staff eligibility uses `POS_STAFF_EMAILS`, with administrator setup/reporting and ownership-limited staff correction access. No auth bypass was added.
- The implementation rebuilt the unavailable prototype. `/kiosk` is an authenticated chooser; `/kiosk/[eventId]` logs orders against persistent records.
- The additive migration is `lib/db/migrations/20261029193831_pos_drink_analytics.sql`. Its filename came from the Supabase CLI and its DDL comes from the POS Drizzle declarations. Applying it remains separate from installation/builds.
- A known stale-menu failure offers explicit menu refresh. Changed/unavailable draft lines are removed for review; unchanged lines and kerb remain. Uncertain submissions stay frozen for exact retries.
- Domain tests: seven passed. Real PostgreSQL tests: eight passed. These include distinct-order timing and atomic menu reordering, stale requests, event ownership, and append behavior. Typecheck and the optimized production build passed. Final lint passes with five existing warnings and no errors.
- Browser verification covered event/menu setup, mixed Hot/Iced orders, blank and populated kerbs, persistence after refresh, corrections and void history, reconciled analytics and CSV, cashier ownership, denied member/anonymous access, stale-menu recovery, and an interrupted save retried exactly once after restarting the server.
- Phone and tablet views and the administrator dashboard were inspected without horizontal overflow. Keyboard operation worked and a fresh browser console contained no errors.
- The menu follow-up was verified with pointer dragging and repeated keyboard moves, persistence after refresh, and the kiosk's saved order. The 390-pixel layout had no horizontal overflow. The existing four-order demo displayed a 3m 20s average gap; an empty event displayed no value.
- Browser and build verification used disposable local PostgreSQL, local test accounts, and dummy provider configuration. External OAuth, Resend delivery, and shared Supabase were not exercised. No production secrets were copied.
