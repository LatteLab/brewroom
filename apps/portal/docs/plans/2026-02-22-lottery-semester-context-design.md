# Lottery Re-roll, Student Context & Semester Tracking

**Date**: 2026-02-22

## Overview

Three interconnected improvements to the event lottery and admin decision-making workflow:

1. **Student context indicators** — show attendance history inline in guest lists so admins make informed decisions
2. **Draft lottery with re-roll** — lottery produces reviewable draft results before finalizing
3. **Semester tracking** — auto-detected MIT semester scopes lottery stats and scoring

## 1. Data Model Changes

### New table: `semesters`

| Column | Type | Notes |
|---|---|---|
| id | UUID, PK | |
| label | text, unique | e.g., "Spring 2026" |
| isCurrent | boolean, default false | Manual override flag |
| createdAt | timestamp | |

Only one row should have `isCurrent = true`. When none do, the system auto-detects from the date.

### Modified enum: `registrationStatusEnum`

Add two new statuses:

```
draft_selected   — lottery winner, pending admin review
draft_rejected   — lottery loser, pending admin review
```

Full enum: `registered`, `waitlisted`, `selected`, `rejected`, `checked_in`, `no_show`, `pending_approval`, `draft_selected`, `draft_rejected`.

### New enum + column on `events`

```sql
lottery_status_enum: 'draft' | 'finalized'
```

New nullable column `lotteryStatus` on the `events` table. Values:
- `null` — lottery hasn't run
- `draft` — lottery ran, results under review
- `finalized` — results committed

### Modified table: `lottery_history`

Add column:

| Column | Type | Notes |
|---|---|---|
| semester | text, nullable | Semester label at time of draw |

## 2. Semester Auto-Detection

### MIT Academic Calendar Boundaries

| Period | Date Range |
|---|---|
| IAP | Jan 1 – Jan 31 |
| Spring | Feb 1 – May 31 |
| Summer | Jun 1 – Aug 31 |
| Fall | Sep 1 – Dec 31 |

Based on MIT Registrar calendar. Dates are slightly padded from exact class dates since club events won't occur right at boundaries.

### Resolution Logic

```
function getCurrentSemesterLabel():
  1. Query semesters table for row with isCurrent = true
  2. If found → return that label
  3. Otherwise → compute from current date:
     - Jan 1–31       → "IAP {year}"
     - Feb 1–May 31   → "Spring {year}"
     - Jun 1–Aug 31   → "Summer {year}"
     - Sep 1–Dec 31   → "Fall {year}"
```

### Admin Settings UI

In `/admin/settings`, a new "Semester" card:
- Displays: "Current semester: **Spring 2026** (auto-detected)" or "(manual override)"
- Input to type a custom label + "Override" button
- "Reset to auto" button clears override

## 3. Updated Priority Score Formula

### Current

```
score = 1.0 + (allTimeLosses * 0.5) - (noShowCount * 1.5)
min = 0.1
```

### New

```
score = 1.0
  + (semesterLosses * 0.5)      // losses THIS semester only
  - (semesterWins * 0.75)       // wins THIS semester only
  - (noShowCount * 1.5)         // all-time no-shows
min = 0.1
```

- Wins/losses reset each semester via semester scoping
- No-shows persist all-time (behavioral consequence)
- Win penalty (0.75) > loss bonus (0.5) to distribute spots more evenly
- Falls back to all-time stats if no semester is configured

## 4. Draft Lottery Flow

### Current flow

Run lottery → results applied immediately → event closes → cannot undo.

### New flow

**Step 1: Run Lottery (draft)**
- Admin clicks "Run Lottery" → confirmation dialog
- Weighted random selection runs (same algorithm, updated scoring)
- Winners → `draft_selected`, losers → `draft_rejected`
- Event `lotteryStatus` → `draft`
- Event `status` stays `open`
- UI switches to lottery review panel

**Step 2: Review**
- Banner: "Lottery draft — review results before finalizing"
- Two sections: Selected (N) and Not Selected (N)
- Each selected person has a "Remove" button → moves them to `draft_rejected`
- "Re-roll (N slots)" button fills freed slots from `draft_rejected` pool using weighted random
- Admin can remove + re-roll multiple times
- "Discard Draft" resets all back to `pending_approval`, clears `lotteryStatus`

**Step 3: Finalize**
- `draft_selected` → `selected`
- `draft_rejected` → `rejected`
- Lottery history entries created (tagged with current semester)
- Priority scores snapshotted on registrations
- Event `lotteryStatus` → `finalized`
- Event `status` → `closed`

Key: lottery history and score snapshots are written at finalization only, not during draft. Re-rolls don't create duplicate history.

### Server Actions

| Action | Description |
|---|---|
| `runLotteryDraft(eventId)` | Run weighted selection, set draft statuses |
| `removeDraftSelected(registrationId, eventId)` | Move draft_selected → draft_rejected |
| `rerollLottery(eventId)` | Fill empty draft_selected slots from draft_rejected pool |
| `finalizeLottery(eventId)` | Commit drafts → final statuses, write history, close event |
| `discardLotteryDraft(eventId)` | Reset all drafts → pending_approval |

## 5. Student Context Indicators

### Compact Indicators (inline per guest row)

| Indicator | Display | When |
|---|---|---|
| No-shows | Red badge: `2 NS` | count > 0 |
| Events attended | Gray text: `5 attended` | Always |
| Lottery record | Gray text: `1W / 3L` | Has lottery history this semester |

Shown in the Guests tab and in the Lottery Review panel, next to each user row.

### User Detail Modal

Clicking a guest row opens a modal/sheet showing:
- Profile: avatar, name, email, major, class year, bio
- Stat cards: events attended, no-shows, lottery wins, lottery losses
- Full event history with status badges

Reuses data/layout patterns from existing `/admin/users/[id]` page.

### Data Fetching

New query `getEventRegistrationsWithStats(eventId)` returns, per registration:
- All existing fields
- `stats.noShowCount` — all-time no-shows
- `stats.eventsAttended` — all-time check-ins
- `stats.lastEventName` + `stats.lastEventDate` — most recent check-in
- `stats.semesterLotteryWins` + `stats.semesterLotteryLosses` — current semester

### Extended Registration Type

```typescript
export interface Registration {
  registration: {
    id: string;
    status: string;
    lotteryPriorityScore: number | null;
    createdAt: Date;
  };
  user: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
  };
  stats?: {
    noShowCount: number;
    eventsAttended: number;
    lastEventName: string | null;
    lastEventDate: Date | null;
    semesterLotteryWins: number;
    semesterLotteryLosses: number;
  };
}
```

## 6. File Changes

### Schema & Types
- `lib/db/schema.ts` — add `semesters` table, new enum values, `lotteryStatus` on events, `semester` on lottery_history
- `lib/types/event.ts` — extend `Registration` with `stats`, add `draft_selected`/`draft_rejected` to `statusColors`

### Queries
- `lib/db/event-queries.ts` — new `getEventRegistrationsWithStats()`, `getCurrentSemesterLabel()`, updated `computePriorityScore()`, semester CRUD queries

### Server Actions
- `app/actions/events.ts` — replace `runLottery()` with draft/review/finalize actions
- `app/actions/admin.ts` — add `setSemesterOverride()`, `clearSemesterOverride()`

### Components — Modified
- `components/admin/guest-list.tsx` — compact stat indicators, clickable rows, lottery review panel detection
- `components/admin/lottery-draw.tsx` — calls `runLotteryDraft` instead of `runLottery`
- `components/admin/event-management-tabs.tsx` — passes `lotteryStatus` through
- `app/(admin)/admin/settings/page.tsx` — add semester manager card
- `app/(admin)/admin/events/[id]/page.tsx` — use `getEventRegistrationsWithStats`, pass `lotteryStatus`

### Components — New
- `components/admin/lottery-review.tsx` — draft review panel (selected/rejected lists, remove, re-roll, finalize, discard)
- `components/admin/user-detail-modal.tsx` — full user profile + history modal
- `components/admin/semester-manager.tsx` — semester settings card

### No Changes Needed
- User-facing pages
- Check-in flow
- Event creation form
