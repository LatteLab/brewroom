# Private Events & Require Approval Design

## Overview

Add a third event type (`invite_only`) for private events accessible only via a shareable invite link, plus a cross-cutting "Require Approval" toggle available on all event types.

## Schema Changes

### Enum Updates

- `event_type`: add `invite_only` → `['waitlist', 'lottery', 'invite_only']`
- `registration_status`: add `pending_approval` → `['registered', 'waitlisted', 'lottery_entered', 'selected', 'rejected', 'checked_in', 'no_show', 'pending_approval']`

### Events Table Additions

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `requireApproval` | boolean | false | Toggle on any event type |
| `inviteCode` | text (unique, nullable) | null | Auto-generated for invite_only events |

### New Table: `event_access`

Tracks which users have accessed an invite link (controls visibility in their timeline).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| userId | text | FK → users, on delete cascade |
| eventId | uuid | FK → events, on delete cascade |
| createdAt | timestamp | default now |

Unique constraint on `(userId, eventId)`.

## Invite Link Flow

### URL Structure

`/invite/{inviteCode}` — e.g. `/invite/xK9mPqR2vL`

### Invite Page Behavior (`/invite/[code]/page.tsx`)

1. Server component looks up event by `inviteCode`
2. No event found → 404
3. User not logged in → redirect to `/login` with return URL
4. User logged in → create `event_access` row (idempotent) → redirect to `/user/events/{eventId}`

### Visibility Rules

- Private events hidden from `/user/events` listings unless user has `event_access` row
- Once unlocked, event appears normally in user's timeline

## Approval Flow

### Require Approval ON

1. User sees "Request Access" button instead of "Register"
2. Clicking creates registration with `pending_approval` status
3. Admin sees pending requests in registrations table (sorted to top)
4. Admin approves → status changes to `registered` (invite_only/waitlist) or `lottery_entered` (lottery)
5. Admin denies → status changes to `rejected`

### Require Approval OFF

- No change to existing behavior for waitlist/lottery
- For invite_only: simple FCFS registration up to capacity

## Registration Button State Machine

### invite_only Events

| State | Button | Action |
|-------|--------|--------|
| No reg + approval ON | "Request Access" | Create `pending_approval` |
| No reg + approval OFF | "Register" | Create `registered` (if capacity) |
| `pending_approval` | "Pending Approval" (disabled) | — |
| `registered` | "Cancel Registration" | Delete registration |
| `rejected` | "Request Denied" (disabled) | — |
| Event full + approval OFF | "Event Full" (disabled) | — |
| `checked_in` | "Checked In" (disabled) | — |

### waitlist/lottery + Require Approval ON

| State | Button | Action |
|-------|--------|--------|
| No registration | "Request Access" | Create `pending_approval` |
| `pending_approval` | "Pending Approval" (disabled) | — |
| Other statuses | Same as today | Same as today |

### waitlist/lottery + Require Approval OFF

Unchanged from current behavior.

## Admin UX Changes

### Event Form

- Add `invite_only` to type selector
- Add "Require Approval" toggle (visible for all types)
- Hide lottery deadline when type is `invite_only`

### Event Detail Page

- For invite_only events: show invite link card with "Copy Link" and "Regenerate Link" buttons

### Registrations Table

- New `pending_approval` status badge (amber)
- Inline "Approve" / "Deny" action buttons for pending rows
- Pending approvals sorted to top

## New Server Actions

- `approveRegistration(registrationId, eventId)` — admin-only
- `denyRegistration(registrationId, eventId)` — admin-only
- `accessEventByInviteCode(inviteCode)` — creates event_access row
- `regenerateInviteCode(eventId)` — admin-only

## Files to Modify

- `lib/db/schema.ts` — schema changes
- `lib/validations/events.ts` — add invite_only, requireApproval
- `app/actions/events.ts` — new + modified actions
- `lib/db/event-queries.ts` — new query helpers
- `app/(user)/user/events/page.tsx` — filter private events
- `app/(user)/user/events/[id]/page.tsx` — access check
- `app/invite/[code]/page.tsx` — new invite redirect page
- `components/admin/event-form.tsx` — new fields
- `components/admin/registrations-table.tsx` — approval actions
- `app/(admin)/admin/events/[id]/page.tsx` — invite link card
- `components/user/event-registration-button.tsx` — new states
