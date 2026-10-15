# Event System Redesign Design

## Overview

Replace the current event type system (`waitlist`/`lottery`/`invite_only`) with independent, composable settings. Replace `draft`/`published` status with a `private`/`public` visibility toggle. Simplify event lifecycle and eliminate edge cases from mid-event config changes.

## Motivation

The current system couples registration mechanics (FCFS, lottery, invite-only) with visibility and approval into a single `event_type` enum. This creates problems:

- Changing type mid-event corrupts registration data (no guards)
- `draft` status overlaps conceptually with `invite_only` visibility
- `lottery` as a type forces the decision at creation time, when it's really an admin action at review time
- Waitlist behavior is implicit to the `waitlist` type rather than an explicit toggle

## New Event Model

Instead of event types, events have independent settings:

| Setting | Values | Changeable after creation? |
|---------|--------|---------------------------|
| **Visibility** | `private` / `public` | Yes, anytime |
| **Capacity** | integer | Yes, anytime |
| **Waitlist Enabled** | boolean | Yes, anytime |
| **Require Approval** | boolean | No (locked at creation) |
| **Status** | `open` / `closed` / `completed` | Yes (forward only) |

### Visibility

- `public` — visible in event listings, anyone can view and register
- `private` — hidden from listings, requires invite link to access (uses existing `inviteCode` + `event_access` mechanism)
- An invite code is auto-generated for all private events
- Switching to public makes the event visible in listings; existing invite links continue to work
- Switching to private hides it again; existing registrants keep access

### Require Approval

Locked at creation. Determines the registration flow:

**OFF (FCFS):**
- Users register immediately
- If at capacity + waitlist enabled: overflow to waitlist (auto-promoted on cancellation)
- If at capacity + no waitlist: "Event Full"

**ON:**
- Users request access → `pending_approval` status
- Admin reviews and can either:
  - Manually approve/deny individual requests
  - Run lottery to randomly select from pending pool (weighted by history)

### Waitlist

- Only relevant when Require Approval is OFF
- Toggle shown conditionally when capacity is set
- When enabled: users who can't get a spot go to waitlist
- Auto-promotion when a registered user cancels

## Schema Changes

### Remove

- `event_type` enum (`waitlist`, `lottery`, `invite_only`)
- `type` column from events table
- `lotteryDeadline` column from events table
- `lottery_entered` value from `registration_status` enum

### Modify

- `event_status` enum: `['draft', 'open', 'closed', 'completed']` → `['open', 'closed', 'completed']`

### Add

- `visibility` column: `event_visibility` enum `['private', 'public']`, default `'private'`
- `waitlistEnabled` column: boolean, default `false`

### Keep As-Is

- `capacity` (integer)
- `requireApproval` (boolean, default false)
- `inviteCode` (text, nullable, unique) — now auto-generated for all private events
- `event_access` table — used for all private events
- `lottery_history` table — used when admin runs lottery
- `lotteryPriorityScore` on registrations — used when lottery is run

### Registration Status Values

- `registered` — confirmed spot (FCFS or manually approved)
- `waitlisted` — overflow, FCFS only
- `pending_approval` — awaiting admin decision (approval-required events)
- `selected` — won lottery
- `rejected` — denied or lost lottery
- `checked_in` — attended
- `no_show` — didn't attend

Removed: `lottery_entered` (replaced by `pending_approval`)

## Event Lifecycle

```
Created → status: 'open', visibility: 'private' or 'public'

open → closed    (admin manually closes registration, or lottery is run)
closed → completed  (admin closes event, no-shows marked)
```

Status transitions are forward-only. Visibility can change freely at any point.

## Registration Flows

### Require Approval OFF (FCFS)

```
User visits event → "RSVP" button

If capacity not reached:
  → status: 'registered'

If at capacity + waitlist ON:
  → status: 'waitlisted' (auto-promoted on cancellation)

If at capacity + waitlist OFF:
  → "Event Full" (disabled button)
```

### Require Approval ON

```
User visits event → "Request Access" button
  → status: 'pending_approval'

Admin reviews registrations:
  Option A: Manually approve/deny individual requests
    approve → 'registered' (checks capacity)
    deny → 'rejected'

  Option B: Run lottery (available when pending requests exist)
    → weighted random selection up to capacity
    → winners: 'selected', losers: 'rejected'
    → lottery history recorded
    → event status → 'closed'
```

## Admin Event Form UX

### Create Event

- Visibility toggle: Private / Public (default Private)
- Capacity input (number)
- Waitlist toggle (shown when capacity is set, only relevant when approval is off)
- Require Approval toggle
- No event type selector
- No lottery deadline field
- No status selector (events start as `open`)

### Edit Event

- Visibility: editable toggle
- Capacity: editable
- Waitlist: editable toggle
- Require Approval: read-only label/badge (locked at creation)
- Status: "Close Registration" button (open → closed), "Complete Event" button (closed → completed)

## Admin Event Detail Page

### Registrations Tab (Approval Required)

- Pending requests sorted to top
- Inline approve/deny buttons per request
- "Run Lottery" button — visible when pending requests exist
- "Close Registration" button — stops new requests

### Registrations Tab (FCFS)

- Registration list with statuses
- "Close Registration" button
- No lottery or approve/deny controls

## User Event Detail Page

### Registration Button States

| State | Approval OFF | Approval ON |
|-------|-------------|-------------|
| No registration | "RSVP" | "Request Access" |
| At capacity (waitlist on) | "Join Waitlist" | "Request Access" |
| At capacity (no waitlist) | "Event Full" | "Request Access" |
| `pending_approval` | n/a | "Pending Approval" (disabled) |
| `registered` | "You're In" + Cancel | "You're In" + Cancel |
| `selected` | n/a | "You've Been Selected" + Cancel |
| `rejected` | n/a | "Not Selected" (disabled) |
| `waitlisted` | "On Waitlist" + Cancel | n/a |
| Event closed/completed | Disabled | Disabled |

### Private Events

- Hidden from `/user/events` listings unless user has `event_access` row
- Accessible via invite link (`/invite/{code}`)
- Once accessed, event appears normally in user's event list

## Data Migration

Existing events need migration from the old model:

- `type: 'waitlist'` → `requireApproval: false`, `waitlistEnabled: true`
- `type: 'lottery'` → `requireApproval: true`, `waitlistEnabled: false`
- `type: 'invite_only'` → `visibility: 'private'`, `requireApproval: false`, `waitlistEnabled: false`
- `status: 'draft'` → `visibility: 'private'`, `status: 'open'`
- `status: 'open'` → `visibility: 'public'`, `status: 'open'`
- `registration_status: 'lottery_entered'` → `'pending_approval'`

## Files to Modify

- `lib/db/schema.ts` — enum + table changes
- `lib/validations/events.ts` — new validation schema
- `app/actions/events.ts` — rewrite registration logic, remove type-based branching
- `lib/db/event-queries.ts` — update queries
- `components/admin/event-form.tsx` — new form fields, remove type selector
- `components/admin/registrations-table.tsx` — lottery button, close registration
- `components/user/event-registration-button.tsx` — simplified state machine
- `app/(admin)/admin/events/[id]/page.tsx` — updated detail page
- `app/(user)/user/events/[id]/page.tsx` — remove lottery deadline, update access checks
- `app/(user)/user/events/page.tsx` — update visibility filtering
- `app/invite/[code]/page.tsx` — update to work with visibility instead of type
