# Events MVP Design

**Date:** 2026-02-16
**Status:** Approved

## Scope

MVP event management system for Latte Lab with Luma-inspired UI/UX.

**In scope:**

- Waitlist + Lottery event types
- Member portal: event catalog, event detail, member directory, profile editing
- Admin: event creation/management, lottery draw, check-in mode, attendance analytics
- Replace fake Team Directory data with real DB-backed member profiles
- Server actions architecture (matches existing codebase patterns)
- Luma-style clean, dark-mode-first design

**Out of scope (deferred):**

- Invitation-only event type
- Email notifications (Resend)
- Mailchimp sync
- QR code check-in
- Sticky Dates on Timeline Tagging
- Optimize for Event Fetching Delay
- Mutuals (Partiful's Feature to seeing who's gone to what)

---

## Database Schema

### Extended `users` table (new columns)

| Column             | Type             | Notes                     |
| ------------------ | ---------------- | ------------------------- |
| `major`          | `varchar(100)` | Nullable, user-editable   |
| `classYear`      | `varchar(10)`  | e.g. "2026", "G1", "PhD"  |
| `phone`          | `varchar(20)`  | Nullable                  |
| `interests`      | `text`         | Nullable, free-form       |
| `semesterStatus` | `varchar(50)`  | e.g. "Spring 2026 Active" |
| `bio`            | `text`         | Nullable                  |
| `location`       | `varchar(100)` | Nullable                  |

### `events` table

| Column              | Type                                             | Notes                      |
| ------------------- | ------------------------------------------------ | -------------------------- |
| `id`              | `uuid`                                         | PK, default random         |
| `name`            | `varchar(255)`                                 | Required                   |
| `description`     | `text`                                         | Event description          |
| `coverImage`      | `text`                                         | URL to uploaded image      |
| `date`            | `timestamp`                                    | Event start                |
| `endDate`         | `timestamp`                                    | Nullable, event end        |
| `location`        | `varchar(255)`                                 | Physical location          |
| `capacity`        | `integer`                                      | Max attendees              |
| `type`            | `enum('waitlist', 'lottery')`                  | Registration type          |
| `lotteryDeadline` | `timestamp`                                    | Nullable, only for lottery |
| `status`          | `enum('draft', 'open', 'closed', 'completed')` | Event lifecycle            |
| `createdBy`       | `text`                                         | FK to users.id             |
| `createdAt`       | `timestamp`                                    | Auto                       |
| `updatedAt`       | `timestamp`                                    | Auto                       |

### `eventRegistrations` table

| Column                   | Type          | Notes                                                                                                        |
| ------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------ |
| `id`                   | `uuid`      | PK                                                                                                           |
| `userId`               | `text`      | FK to users.id                                                                                               |
| `eventId`              | `uuid`      | FK to events.id                                                                                              |
| `status`               | `enum`      | `registered`, `waitlisted`, `lottery_entered`, `selected`, `rejected`, `checked_in`, `no_show` |
| `lotteryPriorityScore` | `real`      | Nullable, snapshotted at draw time                                                                           |
| `createdAt`            | `timestamp` | Auto                                                                                                         |
| `updatedAt`            | `timestamp` | Auto                                                                                                         |

Unique constraint on `(userId, eventId)`.

### `lotteryHistory` table

| Column        | Type                    | Notes           |
| ------------- | ----------------------- | --------------- |
| `id`        | `uuid`                | PK              |
| `userId`    | `text`                | FK to users.id  |
| `eventId`   | `uuid`                | FK to events.id |
| `outcome`   | `enum('won', 'lost')` | Result          |
| `createdAt` | `timestamp`           | Auto            |

No-shows tracked via `eventRegistrations.status = 'no_show'` (no duplication in lottery_history).

---

## Member Portal

### Event Catalog (`/user/events`)

Responsive grid (1/2/3 columns). Each card:

- Cover image (16:9, rounded, hover scale)
- Date (muted accent, e.g. "SAT, MAR 15"), name (bold, tight tracking), location
- Status badge: "Open" (green), "Waitlist" (amber), "Lottery Open" (purple), "Lottery Closed" (gray)
- Subtle shadow, lift on hover

Top bar: search input + filter (All / Upcoming / Past).

### Event Detail (`/user/events/[id]`)

Two-column on desktop, stacking on mobile.

**Left:** Cover image (square, rounded-2xl), host info.

**Right:**

- Name (text-3xl, font-bold, tight tracking)
- Date/time with calendar icon
- Location with map pin
- Capacity indicator with progress bar ("12 / 20 spots")
- Primary action button (full-width, rounded-xl):
  - Waitlist with spots: "RSVP"
  - Waitlist full: "Join Waitlist"
  - Lottery before deadline: "Enter Lottery" + countdown
  - Lottery after deadline: "Lottery Closed" (disabled)
  - Already registered: "You're In" with cancel option
  - Selected from lottery: "You've Been Selected"
- Description
- Guest list (stacked avatars + "+N more")

Mobile: single column, sticky CTA at bottom with backdrop blur.

### Member Directory (`/user/directory`)

Search bar + grid/list of member cards (avatar, name, class year, major). Click for full profile. Client-side filtering.

### Member Profile (`/user/directory/[id]`)

Read-only: avatar, name, class year, major, bio, interests, contact info.

### Edit Profile (`/user/profile`)

Form to edit own fields: major, class year, phone, interests, bio, location. Server action to update users table.

---

## Admin Event Management

### Event List (`/admin/events`)

Table: Name, Date, Type, Status, Registration count. Click to manage.

### Event Creation (`/admin/events/new`)

Single-page form, Luma-style sidebar layout.

**Sidebar (~320px):**

- Cover image upload (drag-and-drop, dashed border)
- Event type selector (Waitlist / Lottery radio)
- Lottery deadline picker (shown when Lottery selected)
- Status toggle (Draft / Publish)

**Main area:**

- Event name (large borderless input, text-3xl)
- Date/time pickers (start + optional end)
- Location input
- Capacity input
- Description textarea

### Event Management (`/admin/events/[id]`)

**Overview:** Edit event details (same form, pre-filled).

**Registrations:** Table of all registrations (name, email, status, registered at, priority score for lottery). Admin can remove or change status. For lottery events: "Run Lottery" button.

**Lottery draw flow:**

1. Click "Run Lottery" -> confirmation dialog
2. Compute priority: 1.0 base + 0.5 per past loss - 1.0 per past no-show
3. Weighted random selection for N spots (capacity)
4. Review screen: Winners / Not Selected
5. "Confirm Results" to finalize (update statuses, write lottery_history)

### Check-in Mode (`/admin/events/[id]/checkin`)

Mobile-optimized, full-screen. Designed for admins at the door.

- Top: event name + counter ("14 / 20 checked in") + progress bar
- Auto-focused search bar
- Alphabetical list of confirmed attendees
- Each row: avatar, name, tap-to-toggle (green checkmark when checked in)
- Large tap targets (48px min)
- "Close Event" button: confirms "mark unchecked as no-show?", bulk updates, sets event to completed

### Attendance Analytics

Dashboard stat cards: Total Events, Average Attendance Rate, No-Show Rate.

User detail page (`/admin/users/[id]`): events attended, no-show count, lottery win/loss, attendance history list.

---

## Navigation

### Member sidebar

- Events (`/user/events`)
- Directory (`/user/directory`)
- Profile (`/user/profile`)
- Admin link (if isAdmin)

### Admin sidebar (extend existing)

- Dashboard (`/admin`)
- Events (`/admin/events`) — new
- Users (`/admin/users`)
- Settings (`/admin/settings`)

---

## Route Map

```
app/
├── (user)/user/
│   ├── layout.tsx              # User sidebar layout
│   ├── page.tsx                # Redirect to /user/events
│   ├── events/
│   │   ├── page.tsx            # Event catalog
│   │   └── [id]/page.tsx       # Event detail
│   ├── directory/
│   │   ├── page.tsx            # Member directory
│   │   └── [id]/page.tsx       # Member profile
│   └── profile/
│       └── page.tsx            # Edit own profile
├── (admin)/admin/
│   ├── events/
│   │   ├── page.tsx            # Event management list
│   │   ├── new/page.tsx        # Create event
│   │   └── [id]/
│   │       ├── page.tsx        # Manage event
│   │       └── checkin/page.tsx # Check-in mode
```

---

## Design Style

Luma-inspired, clean and professional:

- Dark mode default
- Rounded-2xl corners on cards and images
- Subtle shadows (`shadow-[0_20px_60px_-2.5px_rgba(0,0,0,0.05)]`)
- Tight letter-spacing on headings
- Backdrop blur on sticky elements
- Muted accent colors for dates and secondary info
- Large, rounded action buttons
- Consistent use of shadcn/ui components with Tailwind customization

---

## Architecture

- Server components for pages
- Server actions for mutations (register, run lottery, check-in, profile updates, event CRUD)
- Drizzle ORM queries for reads
- Client components only for interactive parts (search, filters, forms)
- No API routes needed
