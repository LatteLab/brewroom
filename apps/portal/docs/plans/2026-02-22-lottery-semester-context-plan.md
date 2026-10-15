# Lottery Re-roll, Student Context & Semester Tracking — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add draft lottery with re-roll, student context indicators in guest lists, and auto-detected semester tracking that scopes lottery scoring.

**Architecture:** Extend the existing Drizzle schema with a `semesters` table, new registration statuses (`draft_selected`/`draft_rejected`), and a `lotteryStatus` field on events. Replace the one-shot lottery with a draft→review→finalize flow. Enrich the guest list query with per-user attendance stats. Auto-detect MIT semester from date with admin override.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Drizzle ORM, PostgreSQL (Supabase), shadcn/ui, Tailwind CSS v4

**Design doc:** `docs/plans/2026-02-22-lottery-semester-context-design.md`

---

## Task 1: Schema Changes — Semesters Table & Lottery Status

**Files:**
- Modify: `lib/db/schema.ts:1-144`

**Step 1: Add the `lotteryStatusEnum` and `semesters` table, extend existing enums**

In `lib/db/schema.ts`, make these changes:

1. Add `draft_selected` and `draft_rejected` to `registrationStatusEnum` (line 10-12):

```typescript
export const registrationStatusEnum = pgEnum('registration_status', [
  'registered', 'waitlisted', 'selected', 'rejected', 'checked_in', 'no_show', 'pending_approval', 'draft_selected', 'draft_rejected'
]);
```

2. Add new enum after `lotteryOutcomeEnum` (after line 13):

```typescript
export const lotteryStatusEnum = pgEnum('lottery_status', ['draft', 'finalized']);
```

3. Add `lotteryStatus` column to `events` table (after line 87, the `status` line):

```typescript
  lotteryStatus: lotteryStatusEnum('lottery_status'),
```

4. Add `semester` column to `lotteryHistory` table (after line 122, the `outcome` line):

```typescript
  semester: text('semester'),
```

5. Add the `semesters` table after the `lotteryHistory` table (after line 124):

```typescript
// Semesters table - tracks academic semesters for lottery scoping
export const semesters = pgTable('semesters', {
  id: uuid('id').defaultRandom().primaryKey(),
  label: text('label').notNull().unique(),
  isCurrent: boolean('is_current').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

6. Add type exports at the bottom (after line 143):

```typescript
export type Semester = typeof semesters.$inferSelect;
export type NewSemester = typeof semesters.$inferInsert;
```

**Step 2: Update `statusColors` in the shared types file**

In `lib/types/event.ts`, add the draft status colors:

```typescript
  draft_selected: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  draft_rejected: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
```

**Step 3: Push schema to database**

Run: `pnpm db:push`
Expected: Schema changes applied successfully. Drizzle will prompt to confirm adding new enum values, new column, and new table.

**Step 4: Commit**

```bash
git add lib/db/schema.ts lib/types/event.ts
git commit -m "feat: add semesters table, lottery draft statuses, and lotteryStatus on events"
```

---

## Task 2: Semester Utility & Queries

**Files:**
- Modify: `lib/db/event-queries.ts`
- Modify: `lib/db/index.ts` (only if `semesters` is not auto-exported via `schema`)

**Step 1: Add semester imports and utility function**

At the top of `lib/db/event-queries.ts`, add `semesters` to the schema import (line 2):

```typescript
import { events, eventRegistrations, eventAccess, lotteryHistory, users, semesters } from './schema';
```

Add this section after the Analytics Queries section (after line 423):

```typescript
// ============================================================================
// Semester Queries
// ============================================================================

/**
 * Auto-detect MIT semester from a date.
 * IAP: Jan 1–31, Spring: Feb 1–May 31, Summer: Jun 1–Aug 31, Fall: Sep 1–Dec 31
 */
export function detectSemesterLabel(date: Date = new Date()): string {
  const month = date.getMonth(); // 0-indexed
  const year = date.getFullYear();
  if (month === 0) return `IAP ${year}`;
  if (month >= 1 && month <= 4) return `Spring ${year}`;
  if (month >= 5 && month <= 7) return `Summer ${year}`;
  return `Fall ${year}`;
}

/**
 * Get the current semester label. Checks for admin override first,
 * falls back to auto-detection.
 */
export async function getCurrentSemesterLabel(): Promise<string> {
  const [override] = await db.select()
    .from(semesters)
    .where(eq(semesters.isCurrent, true))
    .limit(1);
  if (override) return override.label;
  return detectSemesterLabel();
}

export async function getSemesters() {
  return db.select().from(semesters).orderBy(desc(semesters.createdAt));
}

export async function setSemesterOverride(label: string) {
  // Clear any existing override
  await db.update(semesters)
    .set({ isCurrent: false })
    .where(eq(semesters.isCurrent, true));

  // Upsert the new semester
  const [existing] = await db.select()
    .from(semesters)
    .where(eq(semesters.label, label))
    .limit(1);

  if (existing) {
    await db.update(semesters)
      .set({ isCurrent: true })
      .where(eq(semesters.id, existing.id));
  } else {
    await db.insert(semesters).values({ label, isCurrent: true });
  }
}

export async function clearSemesterOverride() {
  await db.update(semesters)
    .set({ isCurrent: false })
    .where(eq(semesters.isCurrent, true));
}
```

**Step 2: Update `getUserLotteryStats` to accept optional semester filter**

Replace the existing `getUserLotteryStats` function (lines 190-202):

```typescript
export async function getUserLotteryStats(userId: string, semester?: string | null) {
  const conditions = [eq(lotteryHistory.userId, userId)];
  if (semester) {
    conditions.push(eq(lotteryHistory.semester, semester));
  }

  const history = await db.select({
    outcome: lotteryHistory.outcome,
    count: count(),
  })
    .from(lotteryHistory)
    .where(and(...conditions))
    .groupBy(lotteryHistory.outcome);

  const wins = history.find(h => h.outcome === 'won')?.count ?? 0;
  const losses = history.find(h => h.outcome === 'lost')?.count ?? 0;
  return { wins, losses };
}
```

**Step 3: Update `computePriorityScore` to use semester-scoped stats**

Replace the existing `computePriorityScore` function (lines 204-210):

```typescript
export async function computePriorityScore(userId: string): Promise<number> {
  const semesterLabel = await getCurrentSemesterLabel();
  const [stats, noShowCount] = await Promise.all([
    getUserLotteryStats(userId, semesterLabel),
    getUserNoShowCount(userId),
  ]);
  // Semester losses boost, semester wins penalize, all-time no-shows penalize
  return 1.0 + (stats.losses * 0.5) - (stats.wins * 0.75) - (noShowCount * 1.5);
}
```

**Step 4: Update `createLotteryHistoryEntries` to accept semester**

Replace the existing function (lines 212-215):

```typescript
export async function createLotteryHistoryEntries(
  entries: { userId: string; eventId: string; outcome: 'won' | 'lost'; semester?: string | null }[]
) {
  if (entries.length === 0) return;
  await db.insert(lotteryHistory).values(entries);
}
```

**Step 5: Verify build**

Run: `pnpm build`
Expected: Compiles without errors. The `getUserLotteryStats` callers outside of this file (admin user detail page) will still work since the semester param is optional.

**Step 6: Commit**

```bash
git add lib/db/event-queries.ts
git commit -m "feat: add semester queries, auto-detection, and semester-scoped scoring"
```

---

## Task 3: Enriched Registration Query (Student Context Stats)

**Files:**
- Modify: `lib/db/event-queries.ts`
- Modify: `lib/types/event.ts`

**Step 1: Extend the `Registration` type with stats**

In `lib/types/event.ts`, replace the existing interface:

```typescript
export interface RegistrationStats {
  noShowCount: number;
  eventsAttended: number;
  lastEventName: string | null;
  lastEventDate: Date | null;
  semesterLotteryWins: number;
  semesterLotteryLosses: number;
}

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
  stats?: RegistrationStats;
}

export const statusColors: Record<string, string> = {
  registered: 'bg-green-500/10 text-green-500 border-green-500/20',
  waitlisted: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  selected: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  rejected: 'bg-red-500/10 text-red-500 border-red-500/20',
  checked_in: 'bg-green-500/10 text-green-700 border-green-500/20',
  no_show: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
  pending_approval: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  draft_selected: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  draft_rejected: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
};
```

**Step 2: Add `getEventRegistrationsWithStats` query**

In `lib/db/event-queries.ts`, add after the existing `getEventRegistrations` function (after line 121):

```typescript
export async function getEventRegistrationsWithStats(eventId: string) {
  // Get base registrations
  const registrations = await getEventRegistrations(eventId);
  if (registrations.length === 0) return [];

  // Get current semester for scoping lottery stats
  const semesterLabel = await getCurrentSemesterLabel();

  // Collect all user IDs
  const userIds = registrations.map(r => r.user.id);

  // Batch query: no-show counts per user
  const noShowRows = await db.select({
    userId: eventRegistrations.userId,
    count: count(),
  })
    .from(eventRegistrations)
    .where(and(
      inArray(eventRegistrations.userId, userIds),
      eq(eventRegistrations.status, 'no_show')
    ))
    .groupBy(eventRegistrations.userId);

  const noShowMap = new Map(noShowRows.map(r => [r.userId, r.count]));

  // Batch query: checked-in counts per user
  const attendedRows = await db.select({
    userId: eventRegistrations.userId,
    count: count(),
  })
    .from(eventRegistrations)
    .where(and(
      inArray(eventRegistrations.userId, userIds),
      eq(eventRegistrations.status, 'checked_in')
    ))
    .groupBy(eventRegistrations.userId);

  const attendedMap = new Map(attendedRows.map(r => [r.userId, r.count]));

  // Batch query: last event attended per user (most recent checked_in)
  const lastEventRows = await db.select({
    userId: eventRegistrations.userId,
    eventName: events.name,
    eventDate: events.date,
  })
    .from(eventRegistrations)
    .innerJoin(events, eq(eventRegistrations.eventId, events.id))
    .where(and(
      inArray(eventRegistrations.userId, userIds),
      eq(eventRegistrations.status, 'checked_in')
    ))
    .orderBy(desc(events.date));

  // Take only the first (most recent) per user
  const lastEventMap = new Map<string, { name: string; date: Date }>();
  for (const row of lastEventRows) {
    if (!lastEventMap.has(row.userId)) {
      lastEventMap.set(row.userId, { name: row.eventName, date: row.eventDate });
    }
  }

  // Batch query: semester lottery stats per user
  const lotteryRows = await db.select({
    userId: lotteryHistory.userId,
    outcome: lotteryHistory.outcome,
    count: count(),
  })
    .from(lotteryHistory)
    .where(and(
      inArray(lotteryHistory.userId, userIds),
      eq(lotteryHistory.semester, semesterLabel)
    ))
    .groupBy(lotteryHistory.userId, lotteryHistory.outcome);

  const lotteryMap = new Map<string, { wins: number; losses: number }>();
  for (const row of lotteryRows) {
    const existing = lotteryMap.get(row.userId) || { wins: 0, losses: 0 };
    if (row.outcome === 'won') existing.wins = row.count;
    if (row.outcome === 'lost') existing.losses = row.count;
    lotteryMap.set(row.userId, existing);
  }

  // Merge stats into registrations
  return registrations.map(r => ({
    ...r,
    stats: {
      noShowCount: noShowMap.get(r.user.id) ?? 0,
      eventsAttended: attendedMap.get(r.user.id) ?? 0,
      lastEventName: lastEventMap.get(r.user.id)?.name ?? null,
      lastEventDate: lastEventMap.get(r.user.id)?.date ?? null,
      semesterLotteryWins: lotteryMap.get(r.user.id)?.wins ?? 0,
      semesterLotteryLosses: lotteryMap.get(r.user.id)?.losses ?? 0,
    },
  }));
}
```

**Step 3: Verify build**

Run: `pnpm build`
Expected: Compiles without errors.

**Step 4: Commit**

```bash
git add lib/db/event-queries.ts lib/types/event.ts
git commit -m "feat: add enriched registration query with per-user attendance stats"
```

---

## Task 4: Draft Lottery Server Actions

**Files:**
- Modify: `app/actions/events.ts:1-381`

**Step 1: Update imports**

In `app/actions/events.ts`, update the imports from event-queries (lines 5-22). Add the new functions:

```typescript
import {
  createEvent as dbCreateEvent,
  updateEvent as dbUpdateEvent,
  deleteEvent as dbDeleteEvent,
  getEventById,
  createRegistration,
  deleteRegistration,
  getUserRegistration,
  getRegistrationCount,
  getEventRegistrations,
  computePriorityScore,
  createLotteryHistoryEntries,
  updateRegistration,
  bulkMarkNoShow,
  getEventByInviteCode,
  createEventAccess,
  hasEventAccess,
  getCurrentSemesterLabel,
} from '@/lib/db/event-queries';
```

**Step 2: Replace `runLottery` with `runLotteryDraft`**

Replace the existing `runLottery` function (lines 171-243) with:

```typescript
export async function runLotteryDraft(eventId: string) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const event = await getEventById(eventId);
  if (!event || !event.requireApproval) throw new Error('Lottery only available for approval-required events');
  if (event.lotteryStatus === 'draft') throw new Error('A lottery draft is already in progress');
  if (event.lotteryStatus === 'finalized') throw new Error('Lottery has already been finalized');

  const regs = await getEventRegistrations(eventId);
  const entrants = regs.filter(r => r.registration.status === 'pending_approval');

  if (entrants.length === 0) throw new Error('No pending requests');

  // Compute priority scores
  const scored = await Promise.all(
    entrants.map(async (entry) => {
      const score = await computePriorityScore(entry.user.id);
      return { ...entry, score: Math.max(score, 0.1) };
    })
  );

  // Weighted random selection
  const confirmedCount = await getRegistrationCount(eventId, ['registered', 'selected', 'checked_in']);
  const spots = Math.max(0, event.capacity - confirmedCount);
  const selected: typeof scored = [];
  const pool = [...scored];

  for (let i = 0; i < Math.min(spots, pool.length); i++) {
    const totalWeight = pool.reduce((sum, e) => sum + e.score, 0);
    let random = Math.random() * totalWeight;
    let pickedIndex = 0;
    for (let j = 0; j < pool.length; j++) {
      random -= pool[j].score;
      if (random <= 0) {
        pickedIndex = j;
        break;
      }
    }
    selected.push(pool[pickedIndex]);
    pool.splice(pickedIndex, 1);
  }

  const selectedIds = new Set(selected.map(s => s.registration.id));

  // Set draft statuses and snapshot scores
  await Promise.all(
    scored.map(async (entry) => {
      const isSelected = selectedIds.has(entry.registration.id);
      await updateRegistration(entry.registration.id, {
        status: isSelected ? 'draft_selected' : 'draft_rejected',
        lotteryPriorityScore: entry.score,
      });
    })
  );

  // Mark event as having a draft lottery (do NOT close registration yet)
  await dbUpdateEvent(eventId, { lotteryStatus: 'draft' });

  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath(`/user/events/${eventId}`);

  return {
    selected: selected.map(s => ({ name: s.user.name, email: s.user.email, score: s.score })),
    rejected: pool.map(s => ({ name: s.user.name, email: s.user.email, score: s.score })),
  };
}

export async function removeDraftSelected(registrationId: string, eventId: string) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const event = await getEventById(eventId);
  if (!event || event.lotteryStatus !== 'draft') throw new Error('No lottery draft in progress');

  const regs = await getEventRegistrations(eventId);
  const reg = regs.find(r => r.registration.id === registrationId);
  if (!reg || reg.registration.status !== 'draft_selected') {
    throw new Error('Registration is not draft selected');
  }

  await updateRegistration(registrationId, { status: 'draft_rejected' });

  revalidatePath(`/admin/events/${eventId}`);
}

export async function rerollLottery(eventId: string) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const event = await getEventById(eventId);
  if (!event || event.lotteryStatus !== 'draft') throw new Error('No lottery draft in progress');

  const regs = await getEventRegistrations(eventId);
  const draftSelected = regs.filter(r => r.registration.status === 'draft_selected');
  const draftRejected = regs.filter(r => r.registration.status === 'draft_rejected');

  // How many slots need filling?
  const confirmedCount = await getRegistrationCount(eventId, ['registered', 'selected', 'checked_in']);
  const totalSlots = Math.max(0, event.capacity - confirmedCount);
  const openSlots = totalSlots - draftSelected.length;

  if (openSlots <= 0 || draftRejected.length === 0) {
    throw new Error('No open slots to fill or no remaining candidates');
  }

  // Score the rejected pool
  const scored = await Promise.all(
    draftRejected.map(async (entry) => {
      const score = entry.registration.lotteryPriorityScore ?? Math.max(await computePriorityScore(entry.user.id), 0.1);
      return { ...entry, score };
    })
  );

  // Weighted random selection for open slots
  const newSelected: typeof scored = [];
  const pool = [...scored];

  for (let i = 0; i < Math.min(openSlots, pool.length); i++) {
    const totalWeight = pool.reduce((sum, e) => sum + e.score, 0);
    let random = Math.random() * totalWeight;
    let pickedIndex = 0;
    for (let j = 0; j < pool.length; j++) {
      random -= pool[j].score;
      if (random <= 0) {
        pickedIndex = j;
        break;
      }
    }
    newSelected.push(pool[pickedIndex]);
    pool.splice(pickedIndex, 1);
  }

  // Update newly selected
  await Promise.all(
    newSelected.map(async (entry) =>
      updateRegistration(entry.registration.id, { status: 'draft_selected' })
    )
  );

  revalidatePath(`/admin/events/${eventId}`);

  return {
    newlySelected: newSelected.map(s => ({ name: s.user.name, email: s.user.email, score: s.score })),
    remainingRejected: pool.length,
  };
}

export async function finalizeLottery(eventId: string) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const event = await getEventById(eventId);
  if (!event || event.lotteryStatus !== 'draft') throw new Error('No lottery draft in progress');

  const regs = await getEventRegistrations(eventId);
  const draftSelected = regs.filter(r => r.registration.status === 'draft_selected');
  const draftRejected = regs.filter(r => r.registration.status === 'draft_rejected');

  // Commit statuses
  await Promise.all([
    ...draftSelected.map(r =>
      updateRegistration(r.registration.id, { status: 'selected' })
    ),
    ...draftRejected.map(r =>
      updateRegistration(r.registration.id, { status: 'rejected' })
    ),
  ]);

  // Write lottery history tagged with current semester
  const semesterLabel = await getCurrentSemesterLabel();
  const historyEntries = [
    ...draftSelected.map(r => ({
      userId: r.user.id,
      eventId,
      outcome: 'won' as const,
      semester: semesterLabel,
    })),
    ...draftRejected.map(r => ({
      userId: r.user.id,
      eventId,
      outcome: 'lost' as const,
      semester: semesterLabel,
    })),
  ];
  await createLotteryHistoryEntries(historyEntries);

  // Finalize
  await dbUpdateEvent(eventId, { lotteryStatus: 'finalized', status: 'closed' });

  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath(`/user/events/${eventId}`);
}

export async function discardLotteryDraft(eventId: string) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const event = await getEventById(eventId);
  if (!event || event.lotteryStatus !== 'draft') throw new Error('No lottery draft in progress');

  const regs = await getEventRegistrations(eventId);
  const draftEntrants = regs.filter(r =>
    r.registration.status === 'draft_selected' || r.registration.status === 'draft_rejected'
  );

  // Reset all draft entries back to pending_approval
  await Promise.all(
    draftEntrants.map(r =>
      updateRegistration(r.registration.id, {
        status: 'pending_approval',
        lotteryPriorityScore: null,
      })
    )
  );

  // Clear lottery status
  await dbUpdateEvent(eventId, { lotteryStatus: null });

  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath(`/user/events/${eventId}`);
}
```

**Step 3: Verify build**

Run: `pnpm build`
Expected: Compiles without errors. The old `runLottery` is removed; `lottery-draw.tsx` will break — that's expected and fixed in Task 6.

**Step 4: Commit**

```bash
git add app/actions/events.ts
git commit -m "feat: replace one-shot lottery with draft/review/finalize/discard actions"
```

---

## Task 5: Semester Admin Actions & Settings UI

**Files:**
- Modify: `app/actions/admin.ts`
- Modify: `app/(admin)/admin/settings/page.tsx`
- Create: `components/admin/semester-manager.tsx`

**Step 1: Add semester server actions**

In `app/actions/admin.ts`, add imports and actions:

```typescript
'use server';

import { addAdminEmail as dbAddAdminEmail, removeAdminEmail as dbRemoveAdminEmail } from '@/lib/db';
import {
  getSemesters,
  setSemesterOverride,
  clearSemesterOverride,
  getCurrentSemesterLabel,
  detectSemesterLabel,
} from '@/lib/db/event-queries';
import { revalidatePath } from 'next/cache';
import type { AdminWhitelist } from '@/lib/db';

export async function addAdminEmail(email: string): Promise<AdminWhitelist> {
  const cleanEmail = email.trim();
  const result = await dbAddAdminEmail(cleanEmail);
  revalidatePath('/admin');
  return result;
}

export async function removeAdminEmail(id: string): Promise<void> {
  await dbRemoveAdminEmail(id);
  revalidatePath('/admin');
}

export async function getSemesterData() {
  const [currentLabel, allSemesters, autoLabel] = await Promise.all([
    getCurrentSemesterLabel(),
    getSemesters(),
    Promise.resolve(detectSemesterLabel()),
  ]);

  const hasOverride = allSemesters.some(s => s.isCurrent);

  return {
    currentLabel,
    autoLabel,
    hasOverride,
    semesters: allSemesters,
  };
}

export async function setSemesterAction(label: string) {
  const cleanLabel = label.trim();
  if (!cleanLabel) throw new Error('Semester label cannot be empty');
  await setSemesterOverride(cleanLabel);
  revalidatePath('/admin/settings');
}

export async function clearSemesterAction() {
  await clearSemesterOverride();
  revalidatePath('/admin/settings');
}
```

**Step 2: Create the `SemesterManager` component**

Create `components/admin/semester-manager.tsx`:

```typescript
'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { setSemesterAction, clearSemesterAction } from '@/app/actions/admin';
import { toast } from 'sonner';

interface SemesterData {
  currentLabel: string;
  autoLabel: string;
  hasOverride: boolean;
  semesters: { id: string; label: string; isCurrent: boolean; createdAt: Date }[];
}

export function SemesterManager({ data }: { data: SemesterData }) {
  const [label, setLabel] = useState(data.hasOverride ? data.currentLabel : '');
  const [isPending, startTransition] = useTransition();

  const handleOverride = () => {
    if (!label.trim()) return;
    startTransition(async () => {
      try {
        await setSemesterAction(label.trim());
        toast.success(`Semester set to "${label.trim()}"`);
      } catch {
        toast.error('Failed to set semester');
      }
    });
  };

  const handleReset = () => {
    startTransition(async () => {
      try {
        await clearSemesterAction();
        setLabel('');
        toast.success('Semester reset to auto-detection');
      } catch {
        toast.error('Failed to reset semester');
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <p className="text-sm">
          Current semester:{' '}
          <span className="font-semibold">{data.currentLabel}</span>
        </p>
        <Badge variant="outline" className="text-xs">
          {data.hasOverride ? 'manual override' : 'auto-detected'}
        </Badge>
      </div>

      {!data.hasOverride && (
        <p className="text-xs text-muted-foreground">
          Auto-detected from MIT academic calendar (IAP: Jan, Spring: Feb–May, Summer: Jun–Aug, Fall: Sep–Dec)
        </p>
      )}

      <div className="flex items-center gap-2">
        <Input
          placeholder={data.autoLabel}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="max-w-xs"
          disabled={isPending}
        />
        <Button size="sm" onClick={handleOverride} disabled={isPending || !label.trim()}>
          Override
        </Button>
        {data.hasOverride && (
          <Button size="sm" variant="outline" onClick={handleReset} disabled={isPending}>
            Reset to Auto
          </Button>
        )}
      </div>

      {data.semesters.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-1">Past semesters:</p>
          <div className="flex flex-wrap gap-1">
            {data.semesters.map((s) => (
              <Badge key={s.id} variant="outline" className="text-xs">
                {s.label}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 3: Add the semester card to the settings page**

Replace `app/(admin)/admin/settings/page.tsx`:

```typescript
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { AdminWhitelistManager } from '@/components/admin/whitelist-manager';
import { SemesterManager } from '@/components/admin/semester-manager';
import { getAdminWhitelist } from '@/lib/db';
import { getSemesterData } from '@/app/actions/admin';
import { PageHeader } from '@/components/ui/page-header';

export default async function SettingsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  if (!session.user.isAdmin) {
    redirect('/user');
  }

  const [whitelist, semesterData] = await Promise.all([
    getAdminWhitelist(),
    getSemesterData(),
  ]);

  return (
    <>
      <PageHeader title="Admin Settings" showSidebarTrigger />

      <div className="flex flex-1 flex-col gap-4 p-6">
        <Card>
          <CardHeader>
            <CardTitle>Semester</CardTitle>
            <CardDescription>
              Controls which semester is used for lottery scoring. Auto-detected from MIT academic calendar
              unless manually overridden.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SemesterManager data={semesterData} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Admin Whitelist</CardTitle>
            <CardDescription>
              Manage which email addresses have admin access. Users with whitelisted emails
              will automatically receive admin privileges when they log in.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AdminWhitelistManager initialWhitelist={whitelist} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
```

**Step 4: Verify build**

Run: `pnpm build`
Expected: Settings page compiles. Semester manager renders.

**Step 5: Commit**

```bash
git add app/actions/admin.ts components/admin/semester-manager.tsx app/\(admin\)/admin/settings/page.tsx
git commit -m "feat: add semester management with auto-detection and admin override"
```

---

## Task 6: Lottery Review Component

**Files:**
- Create: `components/admin/lottery-review.tsx`
- Modify: `components/admin/lottery-draw.tsx`

**Step 1: Create the lottery review panel**

Create `components/admin/lottery-review.tsx`:

```typescript
'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  removeDraftSelected,
  rerollLottery,
  finalizeLottery,
  discardLotteryDraft,
} from '@/app/actions/events';
import { toast } from 'sonner';
import { X, RefreshCw, Check, Undo2, AlertTriangle } from 'lucide-react';
import type { Registration } from '@/lib/types/event';

export function LotteryReview({
  eventId,
  registrations,
}: {
  eventId: string;
  registrations: Registration[];
}) {
  const [showFinalize, setShowFinalize] = useState(false);
  const [showDiscard, setShowDiscard] = useState(false);
  const [isPending, startTransition] = useTransition();

  const draftSelected = registrations.filter(r => r.registration.status === 'draft_selected');
  const draftRejected = registrations.filter(r => r.registration.status === 'draft_rejected');

  const handleRemove = (registrationId: string) => {
    startTransition(async () => {
      try {
        await removeDraftSelected(registrationId, eventId);
        toast.success('Removed from selected');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to remove');
      }
    });
  };

  const handleReroll = () => {
    startTransition(async () => {
      try {
        const result = await rerollLottery(eventId);
        toast.success(`Re-rolled: ${result.newlySelected.length} new selection(s)`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Re-roll failed');
      }
    });
  };

  const handleFinalize = () => {
    startTransition(async () => {
      try {
        await finalizeLottery(eventId);
        setShowFinalize(false);
        toast.success('Lottery finalized');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Finalize failed');
        setShowFinalize(false);
      }
    });
  };

  const handleDiscard = () => {
    startTransition(async () => {
      try {
        await discardLotteryDraft(eventId);
        setShowDiscard(false);
        toast.success('Lottery draft discarded');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Discard failed');
        setShowDiscard(false);
      }
    });
  };

  // Calculate how many open slots exist
  const openSlots = draftRejected.length > 0 ? (
    // We can only know open slots if some were removed; the re-roll action handles the math server-side
    // For the UI, show re-roll button if there are fewer selected than there could be
    true
  ) : false;

  return (
    <div className="space-y-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <h3 className="text-sm font-semibold text-amber-600">Lottery Draft — Review Before Finalizing</h3>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReroll}
            disabled={isPending || draftRejected.length === 0}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Re-roll Open Slots
          </Button>
          <Button
            size="sm"
            onClick={() => setShowFinalize(true)}
            disabled={isPending}
          >
            <Check className="h-3.5 w-3.5 mr-1.5" />
            Finalize
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDiscard(true)}
            disabled={isPending}
          >
            <Undo2 className="h-3.5 w-3.5 mr-1.5" />
            Discard
          </Button>
        </div>
      </div>

      {/* Selected */}
      <div>
        <h4 className="text-sm font-medium text-green-600 mb-2">
          Selected ({draftSelected.length})
        </h4>
        {draftSelected.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">No selections — use Re-roll to fill slots.</p>
        ) : (
          <div className="space-y-1">
            {draftSelected.map(({ registration, user, stats }) => (
              <div key={registration.id} className="flex items-center justify-between rounded-lg border bg-background p-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar className="h-7 w-7">
                    <AvatarImage src={user.image || undefined} />
                    <AvatarFallback className="text-xs">
                      {user.name?.split(' ').map(n => n[0]).join('') || '?'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{user.name || 'Unknown'}</p>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  </div>
                  {stats && (
                    <div className="flex items-center gap-2 ml-2">
                      {stats.noShowCount > 0 && (
                        <Badge variant="outline" className="text-xs bg-red-500/10 text-red-500 border-red-500/20">
                          {stats.noShowCount} NS
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">{stats.eventsAttended} attended</span>
                      {(stats.semesterLotteryWins > 0 || stats.semesterLotteryLosses > 0) && (
                        <span className="text-xs text-muted-foreground">
                          {stats.semesterLotteryWins}W / {stats.semesterLotteryLosses}L
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-2">
                  {registration.lotteryPriorityScore != null && (
                    <span className="text-xs text-muted-foreground">
                      Score: {registration.lotteryPriorityScore.toFixed(1)}
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-500/10"
                    onClick={() => handleRemove(registration.id)}
                    disabled={isPending}
                    title="Remove from selected"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Not Selected */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-2">
          Not Selected ({draftRejected.length})
        </h4>
        {draftRejected.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">All entrants were selected.</p>
        ) : (
          <div className="space-y-1">
            {draftRejected.map(({ registration, user, stats }) => (
              <div key={registration.id} className="flex items-center justify-between rounded-lg border bg-background p-2.5 opacity-60">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar className="h-7 w-7">
                    <AvatarImage src={user.image || undefined} />
                    <AvatarFallback className="text-xs">
                      {user.name?.split(' ').map(n => n[0]).join('') || '?'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{user.name || 'Unknown'}</p>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  </div>
                  {stats && (
                    <div className="flex items-center gap-2 ml-2">
                      {stats.noShowCount > 0 && (
                        <Badge variant="outline" className="text-xs bg-red-500/10 text-red-500 border-red-500/20">
                          {stats.noShowCount} NS
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">{stats.eventsAttended} attended</span>
                    </div>
                  )}
                </div>
                {registration.lotteryPriorityScore != null && (
                  <span className="text-xs text-muted-foreground">
                    Score: {registration.lotteryPriorityScore.toFixed(1)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Finalize confirmation dialog */}
      <Dialog open={showFinalize} onOpenChange={setShowFinalize}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finalize Lottery</DialogTitle>
            <DialogDescription>
              This will confirm {draftSelected.length} selected and {draftRejected.length} rejected.
              Registration will close and lottery history will be recorded. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFinalize(false)}>Cancel</Button>
            <Button onClick={handleFinalize} disabled={isPending}>
              {isPending ? 'Finalizing...' : 'Confirm Finalize'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Discard confirmation dialog */}
      <Dialog open={showDiscard} onOpenChange={setShowDiscard}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard Lottery Draft</DialogTitle>
            <DialogDescription>
              This will reset all {draftSelected.length + draftRejected.length} entries back to pending approval.
              You can run the lottery again afterwards.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDiscard(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDiscard} disabled={isPending}>
              {isPending ? 'Discarding...' : 'Discard Draft'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

**Step 2: Update `lottery-draw.tsx` to use `runLotteryDraft`**

Replace `components/admin/lottery-draw.tsx`:

```typescript
'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { runLotteryDraft } from '@/app/actions/events';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Sparkles } from 'lucide-react';

export function LotteryDraw({ eventId, entrantCount }: { eventId: string; entrantCount: number }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleDraw = () => {
    startTransition(async () => {
      try {
        await runLotteryDraft(eventId);
        setShowConfirm(false);
        toast.success('Lottery draft created — review results before finalizing');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Lottery failed');
        setShowConfirm(false);
      }
    });
  };

  return (
    <>
      <Button
        onClick={() => setShowConfirm(true)}
        disabled={entrantCount === 0}
        size="sm"
        className="gap-2"
      >
        <Sparkles className="h-3.5 w-3.5" />
        Run Lottery ({entrantCount} pending)
      </Button>

      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Run Lottery Draw</DialogTitle>
            <DialogDescription>
              This will create a draft selection from {entrantCount} pending requests using weighted random selection.
              You&apos;ll be able to review, remove, and re-roll before finalizing.
              Priority scores: base 1.0, +0.5 per semester loss, -0.75 per semester win, -1.5 per no-show.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirm(false)}>Cancel</Button>
            <Button onClick={handleDraw} disabled={isPending}>
              {isPending ? 'Drawing...' : 'Create Draft'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

**Step 3: Verify build**

Run: `pnpm build`
Expected: Compiles. Lottery components updated.

**Step 4: Commit**

```bash
git add components/admin/lottery-review.tsx components/admin/lottery-draw.tsx
git commit -m "feat: add lottery review panel with re-roll, finalize, and discard"
```

---

## Task 7: User Detail Modal

**Files:**
- Create: `components/admin/user-detail-modal.tsx`

**Step 1: Create the user detail modal**

Create `components/admin/user-detail-modal.tsx`:

```typescript
'use client';

import { useEffect, useState, useTransition } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Users, XCircle, Trophy, BarChart3 } from 'lucide-react';
import { statusColors } from '@/lib/types/event';

interface UserDetailData {
  user: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
    major?: string | null;
    classYear?: string | null;
    bio?: string | null;
  };
  stats: {
    noShowCount: number;
    eventsAttended: number;
    semesterLotteryWins: number;
    semesterLotteryLosses: number;
  };
  eventHistory: {
    eventName: string;
    eventDate: Date;
    status: string;
  }[];
}

// Server action to fetch user detail — passed as a prop to avoid importing server code
type FetchUserDetail = (userId: string) => Promise<UserDetailData | null>;

export function UserDetailModal({
  userId,
  open,
  onOpenChange,
  fetchUserDetail,
}: {
  userId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fetchUserDetail: FetchUserDetail;
}) {
  const [data, setData] = useState<UserDetailData | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (open && userId) {
      startTransition(async () => {
        const result = await fetchUserDetail(userId);
        setData(result);
      });
    } else {
      setData(null);
    }
  }, [open, userId, fetchUserDetail]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Member Details</SheetTitle>
        </SheetHeader>

        {isPending && (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">Loading...</p>
          </div>
        )}

        {data && !isPending && (
          <div className="mt-6 space-y-6">
            {/* Profile header */}
            <div className="flex items-center gap-4">
              <Avatar className="h-14 w-14">
                <AvatarImage src={data.user.image || undefined} />
                <AvatarFallback className="text-lg">
                  {data.user.name?.split(' ').map(n => n[0]).join('') || '?'}
                </AvatarFallback>
              </Avatar>
              <div>
                <h3 className="text-lg font-semibold">{data.user.name || 'Unknown'}</h3>
                <p className="text-sm text-muted-foreground">{data.user.email}</p>
                {(data.user.classYear || data.user.major) && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {[data.user.classYear && `Class of ${data.user.classYear}`, data.user.major].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
            </div>

            {data.user.bio && (
              <p className="text-sm text-muted-foreground">{data.user.bio}</p>
            )}

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <Card>
                <CardContent className="p-3 text-center">
                  <Users className="h-4 w-4 mx-auto mb-1 text-primary" />
                  <p className="text-xl font-bold">{data.stats.eventsAttended}</p>
                  <p className="text-xs text-muted-foreground">Attended</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 text-center">
                  <XCircle className="h-4 w-4 mx-auto mb-1 text-destructive" />
                  <p className="text-xl font-bold">{data.stats.noShowCount}</p>
                  <p className="text-xs text-muted-foreground">No-Shows</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 text-center">
                  <Trophy className="h-4 w-4 mx-auto mb-1 text-amber-500" />
                  <p className="text-xl font-bold">{data.stats.semesterLotteryWins}</p>
                  <p className="text-xs text-muted-foreground">Lottery Wins (semester)</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 text-center">
                  <BarChart3 className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                  <p className="text-xl font-bold">{data.stats.semesterLotteryLosses}</p>
                  <p className="text-xs text-muted-foreground">Lottery Losses (semester)</p>
                </CardContent>
              </Card>
            </div>

            {/* Event history */}
            <div>
              <h4 className="text-sm font-semibold mb-2">Event History</h4>
              {data.eventHistory.length > 0 ? (
                <div className="space-y-2">
                  {data.eventHistory.map((h, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <div>
                        <p className="font-medium">{h.eventName}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(h.eventDate).toLocaleDateString('en-US', {
                            month: 'short', day: 'numeric', year: 'numeric',
                          })}
                        </p>
                      </div>
                      <Badge variant="outline" className={`text-xs ${statusColors[h.status] || ''}`}>
                        {h.status.replaceAll('_', ' ')}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No event history.</p>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
```

**Step 2: Add the server action to fetch user detail data**

In `app/actions/events.ts`, add at the bottom:

```typescript
export async function getUserDetailForModal(userId: string) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const { getUserById } = await import('@/lib/db/queries');
  const { getUserEventHistory, getUserLotteryStats, getUserNoShowCount, getCurrentSemesterLabel } = await import('@/lib/db/event-queries');

  const user = await getUserById(userId);
  if (!user) return null;

  const semesterLabel = await getCurrentSemesterLabel();
  const [eventHistory, lotteryStats, noShowCount, checkedInCount] = await Promise.all([
    getUserEventHistory(userId),
    getUserLotteryStats(userId, semesterLabel),
    getUserNoShowCount(userId),
    // Count checked_in events
    (async () => {
      const history = await getUserEventHistory(userId);
      return history.filter(h => h.registration.status === 'checked_in').length;
    })(),
  ]);

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      major: user.major,
      classYear: user.classYear,
      bio: user.bio,
    },
    stats: {
      noShowCount,
      eventsAttended: checkedInCount,
      semesterLotteryWins: lotteryStats.wins,
      semesterLotteryLosses: lotteryStats.losses,
    },
    eventHistory: eventHistory.map(h => ({
      eventName: h.event.name,
      eventDate: h.event.date,
      status: h.registration.status,
    })),
  };
}
```

**Step 3: Commit**

```bash
git add components/admin/user-detail-modal.tsx app/actions/events.ts
git commit -m "feat: add user detail modal with profile, stats, and event history"
```

---

## Task 8: Integrate Into Guest List & Event Detail Page

**Files:**
- Modify: `components/admin/guest-list.tsx`
- Modify: `components/admin/event-management-tabs.tsx`
- Modify: `app/(admin)/admin/events/[id]/page.tsx`

**Step 1: Update the event detail page to use enriched query and pass lotteryStatus**

Replace `app/(admin)/admin/events/[id]/page.tsx`:

```typescript
import { auth } from '@/auth';
import { redirect, notFound } from 'next/navigation';
import { getEventById, getEventRegistrationsWithStats } from '@/lib/db/event-queries';
import { PageHeader } from '@/components/ui/page-header';
import { EventManagementTabs } from '@/components/admin/event-management-tabs';

export default async function AdminEventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (!session.user.isAdmin) redirect('/user');

  const { id } = await params;
  const event = await getEventById(id);
  if (!event) notFound();

  const registrations = await getEventRegistrationsWithStats(id);

  return (
    <>
      <PageHeader title={event.name} showSidebarTrigger />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-4 py-6">
          <EventManagementTabs event={event} registrations={registrations} />
        </div>
      </div>
    </>
  );
}
```

**Step 2: Update `event-management-tabs.tsx` to handle lottery status**

The `Event` type from the schema now includes `lotteryStatus`. No changes needed to the tabs component itself since it already passes `event` and `registrations` through to child components, and the `Event` type will automatically include the new field after the schema change.

Verify the component still compiles — the type flows through correctly.

**Step 3: Update `guest-list.tsx` with context indicators, clickable rows, and lottery review**

Replace `components/admin/guest-list.tsx`:

```typescript
'use client';

import { useState, useMemo, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LotteryDraw } from '@/components/admin/lottery-draw';
import { LotteryReview } from '@/components/admin/lottery-review';
import { UserDetailModal } from '@/components/admin/user-detail-modal';
import { approveRegistration, denyRegistration, removeRegistration, getUserDetailForModal } from '@/app/actions/events';
import { toast } from 'sonner';
import { Search, ClipboardCheck, Trash2, Check, X } from 'lucide-react';
import Link from 'next/link';
import type { Event } from '@/lib/db/schema';
import type { Registration } from '@/lib/types/event';
import { statusColors } from '@/lib/types/event';

type StatusFilter = 'all' | 'going' | 'pending_approval' | 'waitlisted' | 'rejected' | 'not_going' | 'checked_in';
type SortBy = 'register_time' | 'name' | 'email' | 'status';

const STATUS_FILTER_MAP: Record<StatusFilter, string[]> = {
  all: [],
  going: ['registered', 'selected', 'checked_in', 'draft_selected'],
  pending_approval: ['pending_approval'],
  waitlisted: ['waitlisted'],
  rejected: ['rejected', 'draft_rejected'],
  not_going: ['no_show'],
  checked_in: ['checked_in'],
};

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function GuestList({
  event,
  registrations,
}: {
  event: Event;
  registrations: Registration[];
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('register_time');
  const [isPending, startTransition] = useTransition();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const hasDraft = event.lotteryStatus === 'draft';

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of registrations) {
      c[r.registration.status] = (c[r.registration.status] || 0) + 1;
    }
    return {
      all: registrations.length,
      going: (c['registered'] || 0) + (c['selected'] || 0) + (c['checked_in'] || 0) + (c['draft_selected'] || 0),
      pending_approval: c['pending_approval'] || 0,
      waitlisted: c['waitlisted'] || 0,
      rejected: (c['rejected'] || 0) + (c['draft_rejected'] || 0),
      not_going: c['no_show'] || 0,
      checked_in: c['checked_in'] || 0,
    };
  }, [registrations]);

  const goingCount = counts.going;
  const percent = event.capacity > 0 ? Math.round((goingCount / event.capacity) * 100) : 0;

  // Filter out draft statuses from the regular guest list when draft is active
  // (they're shown in the LotteryReview panel instead)
  const nonDraftRegistrations = useMemo(() => {
    if (!hasDraft) return registrations;
    return registrations.filter(r =>
      r.registration.status !== 'draft_selected' && r.registration.status !== 'draft_rejected'
    );
  }, [registrations, hasDraft]);

  const displayed = useMemo(() => {
    let list = [...nonDraftRegistrations];

    const allowedStatuses = STATUS_FILTER_MAP[statusFilter];
    if (allowedStatuses.length > 0) {
      list = list.filter(r => allowedStatuses.includes(r.registration.status));
    }

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        r.user.name?.toLowerCase().includes(q) ||
        r.user.email?.toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return (a.user.name || '').localeCompare(b.user.name || '');
        case 'email':
          return (a.user.email || '').localeCompare(b.user.email || '');
        case 'status':
          return a.registration.status.localeCompare(b.registration.status);
        case 'register_time':
        default:
          return new Date(b.registration.createdAt).getTime() - new Date(a.registration.createdAt).getTime();
      }
    });

    return list;
  }, [nonDraftRegistrations, statusFilter, search, sortBy]);

  const handleApprove = (registrationId: string) => {
    startTransition(async () => {
      try {
        await approveRegistration(registrationId, event.id);
        toast.success('Registration approved');
      } catch {
        toast.error('Failed to approve registration');
      }
    });
  };

  const handleDeny = (registrationId: string) => {
    startTransition(async () => {
      try {
        await denyRegistration(registrationId, event.id);
        toast.success('Registration denied');
      } catch {
        toast.error('Failed to deny registration');
      }
    });
  };

  const handleRemove = (registrationId: string) => {
    startTransition(async () => {
      try {
        await removeRegistration(registrationId, event.id);
        toast.success('Registration removed');
      } catch {
        toast.error('Failed to remove registration');
      }
    });
  };

  const handleRowClick = (userId: string) => {
    setSelectedUserId(userId);
    setModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* At a Glance */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">At a Glance</h3>
        <div className="flex items-baseline justify-between">
          <div className="flex items-baseline gap-4">
            <span className="text-sm">
              <span className="text-2xl font-bold">{goingCount}</span>{' '}
              <span className="text-muted-foreground">Going</span>
            </span>
            {counts.pending_approval > 0 && (
              <span className="text-sm">
                <span className="text-lg font-bold text-amber-600">{counts.pending_approval}</span>{' '}
                <span className="text-muted-foreground">Pending</span>
              </span>
            )}
          </div>
          <span className="text-sm text-muted-foreground">cap {event.capacity}</span>
        </div>
        <Progress value={Math.min(percent, 100)} className="h-2" />
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/admin/events/${event.id}/checkin`}>
          <Button variant="outline" size="sm">
            <ClipboardCheck className="h-3.5 w-3.5 mr-1.5" />
            Check In Guests
          </Button>
        </Link>
        {event.requireApproval && event.status === 'open' && !hasDraft && (
          <LotteryDraw eventId={event.id} entrantCount={counts.pending_approval} />
        )}
      </div>

      {/* Lottery Review Panel (when draft is active) */}
      {hasDraft && (
        <LotteryReview eventId={event.id} registrations={registrations} />
      )}

      {/* Guest List */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Guest List</h3>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search guests..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Guests ({counts.all})</SelectItem>
              <SelectItem value="going">Going ({counts.going})</SelectItem>
              <SelectItem value="pending_approval">Pending Approval ({counts.pending_approval})</SelectItem>
              <SelectItem value="waitlisted">Waitlisted ({counts.waitlisted})</SelectItem>
              <SelectItem value="rejected">Rejected ({counts.rejected})</SelectItem>
              <SelectItem value="not_going">Not Going ({counts.not_going})</SelectItem>
              <SelectItem value="checked_in">Checked In ({counts.checked_in})</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
            <SelectTrigger className="w-[160px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="register_time">Register Time</SelectItem>
              <SelectItem value="name">Name</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="status">Status</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {displayed.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground text-sm">No guests found.</p>
        ) : (
          <div className="space-y-1">
            {displayed.map(({ registration, user, stats }) => (
              <div
                key={registration.id}
                className="flex items-center justify-between rounded-lg border p-3 cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => handleRowClick(user.id)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user.image || undefined} />
                    <AvatarFallback className="text-xs">
                      {user.name?.split(' ').map(n => n[0]).join('') || '?'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{user.name || 'Unknown'}</p>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  </div>
                  {/* Compact stat indicators */}
                  {stats && (
                    <div className="flex items-center gap-2 ml-1">
                      {stats.noShowCount > 0 && (
                        <Badge variant="outline" className="text-xs bg-red-500/10 text-red-500 border-red-500/20">
                          {stats.noShowCount} NS
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground hidden sm:inline">
                        {stats.eventsAttended} attended
                      </span>
                      {(stats.semesterLotteryWins > 0 || stats.semesterLotteryLosses > 0) && (
                        <span className="text-xs text-muted-foreground hidden md:inline">
                          {stats.semesterLotteryWins}W / {stats.semesterLotteryLosses}L
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-2" onClick={(e) => e.stopPropagation()}>
                  {event.requireApproval && registration.lotteryPriorityScore != null && (
                    <span className="text-xs text-muted-foreground">
                      Score: {registration.lotteryPriorityScore.toFixed(1)}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground hidden sm:inline">
                    {formatRelativeTime(registration.createdAt)}
                  </span>
                  <Badge variant="outline" className={`text-xs ${statusColors[registration.status] || ''}`}>
                    {registration.status.replaceAll('_', ' ')}
                  </Badge>
                  {registration.status === 'pending_approval' ? (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-500/10"
                        onClick={() => handleApprove(registration.id)}
                        disabled={isPending}
                        title="Approve"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-500/10"
                        onClick={() => handleDeny(registration.id)}
                        disabled={isPending}
                        title="Decline"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleRemove(registration.id)}
                      disabled={isPending}
                      title="Remove"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* User Detail Modal */}
      <UserDetailModal
        userId={selectedUserId}
        open={modalOpen}
        onOpenChange={setModalOpen}
        fetchUserDetail={getUserDetailForModal}
      />
    </div>
  );
}
```

**Step 4: Verify build**

Run: `pnpm build`
Expected: Full build succeeds. All components wired together.

**Step 5: Commit**

```bash
git add components/admin/guest-list.tsx components/admin/event-management-tabs.tsx app/\(admin\)/admin/events/\[id\]/page.tsx
git commit -m "feat: integrate student context indicators, lottery review, and user detail modal into guest list"
```

---

## Task 9: Handle Draft Statuses in User-Facing Pages

**Files:**
- Modify: `components/user/event-registration-button.tsx` (if it needs to handle draft statuses)

**Step 1: Check if user-facing pages need changes**

The user-facing registration button checks registration status to show the correct state. When a lottery draft is in progress, users with `draft_selected` or `draft_rejected` status should see an appropriate message.

In `components/user/event-registration-button.tsx`, add handling for draft statuses. Users who are `draft_selected` or `draft_rejected` should see "Pending Review" since their results aren't finalized yet.

Read the file first, then add cases in the status check:
- `draft_selected` → show "Pending Review" (disabled button, neutral styling)
- `draft_rejected` → show "Pending Review" (same — don't reveal selection status to users before finalization)

**Step 2: Verify build**

Run: `pnpm build`
Expected: All pages compile.

**Step 3: Commit**

```bash
git add components/user/event-registration-button.tsx
git commit -m "feat: show pending review status for draft lottery entries on user-facing pages"
```

---

## Task 10: Final Verification

**Step 1: Full build check**

Run: `pnpm build`
Expected: Clean build with no errors.

**Step 2: Push schema to database**

Run: `pnpm db:push`
Expected: All schema changes applied.

**Step 3: Manual smoke test**

Start the dev server with `pnpm dev` and verify:

1. **Settings page**: Semester card shows auto-detected semester, override works, reset works
2. **Event with approval**: Create a test event with `requireApproval = true`
3. **Lottery draft**: Run lottery → see draft review panel with selected/rejected
4. **Student context**: Guest rows show no-show count, events attended, W/L record
5. **User detail modal**: Click a guest row → modal opens with full profile and history
6. **Re-roll**: Remove a selected person → click re-roll → new person selected
7. **Finalize**: Click finalize → statuses commit, event closes, lottery history recorded
8. **Discard**: (test separately) Run lottery → discard → all back to pending_approval

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: lottery re-roll, student context indicators, and semester tracking"
```
