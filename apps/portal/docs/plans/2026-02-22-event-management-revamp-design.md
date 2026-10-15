# Event Management Page Revamp — Design

## Goal

Revamp the admin event detail/management page (`/admin/events/[id]`) from a two-tab layout (Registrations + Edit) into a Luma-inspired three-tab experience (Overview, Guests, More) that supports pre-event, during-event, and post-event admin workflows. Also revamp the check-in page for inline check/undo per row.

## Architecture

**Approach:** Tab-based single page. The existing `/admin/events/[id]/page.tsx` is rewritten with 3 client-side tabs. Check-in remains a separate route.

```
/admin/events/[id]           → 3-tab page (Overview | Guests | More)
/admin/events/[id]/checkin   → Revamped check-in page
```

The parent page stays a **server component** that fetches event + registrations data and passes it to client tab components.

## Tab 1: Overview

Serves as the event dashboard. Shows event summary, quick actions, and a guests snapshot.

### Layout

```
┌──────────────────────────────────────────┐
│ Event Name                  [Event Page ↗]│
│ Overview | Guests | More                  │
│───────────────────────────────────────────│
│                                           │
│ [Edit Event]  [Share / Copy Invite Link]  │
│                                           │
│ ┌─────────────┐  When & Where            │
│ │ Cover Image │  Feb 23, 2:00 PM EST     │
│ │             │  Room 101, MIT            │
│ │  Event Name │                           │
│ └─────────────┘  Status: Open             │
│                                           │
│ Description                               │
│ Welcome to the event...                   │
│                                           │
│─── Guests ────────────────────────────────│
│ 5 Going                         cap 20   │
│ ████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│ • 2 Pending Approval                      │
│                                           │
│ Recent Registrations       [All Guests →] │
│ ┌─────────────────────────────────────┐   │
│ │ 👤 Jane  jane@mit.edu  Approve | X │   │
│ │ 👤 Bob   bob@mit.edu   registered  │   │
│ └─────────────────────────────────────┘   │
└───────────────────────────────────────────┘
```

### Behavior

- **Edit Event** opens the existing `EventForm` component in a `Sheet` (side panel). On save, the sheet closes and data refreshes.
- **Share / Copy Invite Link** copies the invite URL for private events, or the public event URL for public events.
- **Event Page ↗** links to `/user/events/[id]` (the user-facing page).
- **Guests section** shows At-a-Glance stats: going count, capacity, progress bar, pending approval count.
- **Recent Registrations** shows the latest ~5 registrations. Pending approval rows get inline Approve/Decline actions.
- **All Guests →** programmatically switches the active tab to Guests (no route change).

### Component

New file: `components/admin/event-overview.tsx` (client component).

Props: `event`, `registrations`, `onSwitchToGuests` (callback to change active tab).

## Tab 2: Guests

Full guest management with Luma-style dual-dropdown filtering and sorting. This is a refactor of the existing `registrations-table.tsx`.

### Layout

```
┌───────────────────────────────────────────┐
│ At a Glance                               │
│ 5 Going    2 Pending    cap 20           │
│ ████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│                                           │
│ [Check In Guests]  [Run Lottery]          │
│                                           │
│ Guest List                                │
│ 🔍 Search...                              │
│ [All Guests ▼]        [Register Time ▼]   │
│───────────────────────────────────────────│
│ 👤 Jane Doe  jane@mit.edu                 │
│   pending approval   5h ago   Approve | X │
│───────────────────────────────────────────│
│ 👤 Bob Lee   bob@mit.edu                  │
│   registered         2h ago          [🗑] │
└───────────────────────────────────────────┘
```

### Status Filter (Dropdown 1)

| Filter | Maps to statuses | Count |
|--------|-----------------|-------|
| All Guests | all | total |
| Going | registered, selected, checked_in | sum |
| Pending Approval | pending_approval | count |
| Waitlisted | waitlisted | count |
| Rejected | rejected | count |
| Not Going | no_show | count |
| Checked In | checked_in | count |

### Sort By (Dropdown 2)

| Sort | Field |
|------|-------|
| Name | user.name (alphabetical) |
| Email | user.email (alphabetical) |
| Status | registration.status (grouped) |
| Register Time | registration.createdAt (newest first, default) |

### Behavior

- **Search** filters by name or email (client-side, same as current).
- **Check In Guests** navigates to `/admin/events/[id]/checkin`.
- **Run Lottery** button appears when `requireApproval` is on and event status is `open`. Reuses existing `LotteryDraw` component.
- Pending approval rows show **Approve** / **Decline** action buttons.
- Other rows show a **Remove** (trash) button.
- Lottery priority score shown on rows when `requireApproval` is on.

### Component

Refactor `components/admin/registrations-table.tsx` → rename to `components/admin/guest-list.tsx`. Add status filter state, sort state, search input, and the At-a-Glance stats bar.

## Tab 3: More

Administrative actions that don't belong on Overview or Guests.

### Layout

```
┌───────────────────────────────────────┐
│ Registration                          │
│ ┌───────────────────────────────────┐ │
│ │ Close Registration          [○]  │ │
│ └───────────────────────────────────┘ │
│                                       │
│ Private Event  (if visibility=private)│
│ ┌───────────────────────────────────┐ │
│ │ Invite Code: abc123        COPY  │ │
│ │ [Regenerate Code]                │ │
│ └───────────────────────────────────┘ │
│                                       │
│ Danger Zone                           │
│ ┌───────────────────────────────────┐ │
│ │ Delete this event permanently.   │ │
│ │ This action cannot be undone.    │ │
│ │ [Delete Event]                   │ │
│ └───────────────────────────────────┘ │
└───────────────────────────────────────┘
```

### Behavior

- **Close Registration** reuses existing `CloseRegistrationButton` component. Toggle on/off.
- **Invite Code** section reuses existing `InviteLinkCard` component. Only shown for private events.
- **Delete Event** is new. Opens a confirmation dialog. On confirm, calls `deleteEventAction` server action, which deletes the event and all related registrations/access/lottery history, then redirects to `/admin/events`.

### Component

New file: `components/admin/event-settings.tsx` (client component).

Props: `event`.

## Check-in Page (Revamp)

Route: `/admin/events/[id]/checkin` (existing, rewritten).

### Layout

```
┌───────────────────────────────────────┐
│ ← Back              Event Name   Scan │
│                     Feb 23, 2 PM      │
│───────────────────────────────────────│
│ 🔍 Search for a guest...              │
│ All Guests | Going 5 | Checked In 3  │
│───────────────────────────────────────│
│ 👤 Jane Doe                           │
│    jane@mit.edu                       │
│    ✅ Checked in 2:23 PM     [Undo]  │
│───────────────────────────────────────│
│ 👤 John Smith                         │
│    john@mit.edu          [Check In]   │
│───────────────────────────────────────│
│ 👤 Bob Lee                            │
│    bob@mit.edu                        │
│    ✅ Checked in 2:15 PM     [Undo]  │
│───────────────────────────────────────│
│                                       │
│ [Close Event]                         │
└───────────────────────────────────────┘
```

### Behavior

- **← Back** navigates to `/admin/events/[id]`.
- **Scan** button is a noop placeholder (future QR code scanning).
- **Filter tabs** at top: All Guests, Going (count of registered+selected), Checked In (count). These filter the list below.
- Each row shows avatar, name, email.
- **Not checked in:** Shows a [Check In] button on the right.
- **Checked in:** Shows "Checked in {time}" in green + an [Undo] button.
- Check-in timestamp is stored via the `updatedAt` field on the registration record (already tracked by existing `checkinAttendee` action).
- **Close Event** at bottom with confirmation dialog (existing behavior preserved).
- Mobile-friendly: full-width, large tap targets, sticky search bar.

### Component

Rewrite `components/admin/checkin-list.tsx`.

## Data Changes

### New Server Action: `deleteEventAction`

In `app/actions/events.ts`:
- Validate admin session
- Delete all `event_registrations` where `eventId = id`
- Delete all `event_access` where `eventId = id`
- Delete all `lottery_history` where `eventId = id`
- Delete the event itself
- Delete cover image from Supabase Storage if it exists (non-gradient)
- Redirect to `/admin/events`

### New Query (optional): None needed

All data is already fetched by `getEventRegistrations` and `getEventById`. Filtering and sorting happen client-side since event sizes are manageable (MIT org).

### Schema Changes: None

No database schema changes required. The `updatedAt` field on `event_registrations` already tracks when check-in happened.

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `app/(admin)/admin/events/[id]/page.tsx` | Rewrite | 3-tab layout (Overview, Guests, More) |
| `components/admin/event-overview.tsx` | Create | Overview tab component |
| `components/admin/guest-list.tsx` | Create | Guests tab (refactored from registrations-table) |
| `components/admin/event-settings.tsx` | Create | More tab component |
| `components/admin/checkin-list.tsx` | Rewrite | Revamped check-in with filter tabs + inline undo |
| `components/admin/registrations-table.tsx` | Delete | Replaced by guest-list.tsx |
| `app/actions/events.ts` | Modify | Add `deleteEventAction` |
| `app/(admin)/admin/events/[id]/checkin/page.tsx` | Modify | Pass event date/time to CheckinList |
