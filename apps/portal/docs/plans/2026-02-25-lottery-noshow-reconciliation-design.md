# Lottery No-Show Reconciliation

## Problem

When a lottery winner doesn't show up to an event, `closeEvent()` marks them as `no_show` but their `lottery_history` "won" entry persists. This inflates their W/L ratio and skews the priority score — they keep the win AND get the no-show penalty, making the displayed stats misleading.

## Decision

Revoke (hard delete) the `lottery_history` "won" entry whenever a lottery winner (`selected` status) is moved to a non-going status.

- **Going statuses** (keep win): `registered`, `selected`, `checked_in`
- **Non-going statuses** (revoke win): `no_show`, `rejected`, `pending_approval`, `waitlisted`

## Design

### New query: `deleteLotteryWins(eventId, userIds)`

Added to `lib/db/event-queries.ts`. Deletes `lottery_history` rows where `eventId` matches, `userId` is in the provided list, and `outcome = 'won'`. Used by both paths below.

### Path 1: `closeEvent()` — bulk reconciliation

Before calling `bulkMarkNoShow()`:
1. Query registrations with status `selected` for this event (lottery winners who didn't check in)
2. Call `deleteLotteryWins(eventId, userIds)` to remove their "won" entries
3. Proceed with `bulkMarkNoShow()` and event completion

### Path 2: `changeRegistrationStatus()` — individual reconciliation

When admin manually changes a registration status:
1. If old status is `selected` and new status is non-going, call `deleteLotteryWins(eventId, [userId])` for that single user
2. Proceed with the status update

### What doesn't change

- **Schema**: no new columns, enums, or tables
- **`finalizeLottery()`**: still writes lottery_history entries as before
- **`computePriorityScore()` formula**: still `1.0 + losses*0.5 - wins*0.75 - noShows*1.5` — works with accurate data
- **FCFS / manual approval flow**: unaffected — they use `registered` status, not `selected`
- **`bulkMarkNoShow()`**: stays generic, no lottery awareness

### Edge cases

| Scenario | Behavior |
|----------|----------|
| Lottery winner checks in | `selected` -> `checked_in` — no revoke |
| Lottery winner no-shows at close | `closeEvent()` revokes win, marks `no_show` |
| Admin manually marks lottery winner no_show | `changeRegistrationStatus()` revokes win |
| Admin moves lottery winner to pending | `changeRegistrationStatus()` revokes win |
| FCFS attendee no-shows | No `selected` status, no lottery record — unaffected |
| Event with no lottery | No `selected` registrations — `deleteLotteryWins` is a no-op |
| All lottery winners check in | No `selected` remain at close — no-op |

### Audit trail

The `registration_audit_log` already captures status changes. The lottery_history deletion is not separately logged — the audit log entry showing `selected` -> `no_show` (with actorType `system` or `admin`) serves as the record.

## Files to modify

| File | Change |
|------|--------|
| `lib/db/event-queries.ts` | Add `deleteLotteryWins(eventId, userIds)` |
| `app/actions/events.ts` | Update `closeEvent()` and `changeRegistrationStatus()` |
