# Event System Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace event types (waitlist/lottery/invite_only) with composable settings (visibility, capacity, waitlist toggle, require approval), simplify status lifecycle, and eliminate unsafe mid-event config changes.

**Architecture:** Database schema changes first (enums, columns), then validation, server actions, queries, and finally UI components. Each layer builds on the previous. Data migration SQL runs after schema changes to convert existing events.

**Tech Stack:** Drizzle ORM + PostgreSQL (Supabase), Zod validation, Next.js server actions, React components (shadcn/ui)

---

### Task 1: Update Database Schema Enums & Events Table

**Files:**
- Modify: `lib/db/schema.ts:1-92`

**Step 1: Replace enums and update events table**

Replace the enum definitions and events table. Remove `eventTypeEnum`, add `eventVisibilityEnum`, update `eventStatusEnum` to remove `draft`, update `registrationStatusEnum` to remove `lottery_entered`. Replace `type` and `lotteryDeadline` columns with `visibility` and `waitlistEnabled`.

```typescript
// Replace lines 8-13 with:
export const eventVisibilityEnum = pgEnum('event_visibility', ['private', 'public']);
export const eventStatusEnum = pgEnum('event_status', ['open', 'closed', 'completed']);
export const registrationStatusEnum = pgEnum('registration_status', [
  'registered', 'waitlisted', 'selected', 'rejected', 'checked_in', 'no_show', 'pending_approval'
]);
export const lotteryOutcomeEnum = pgEnum('lottery_outcome', ['won', 'lost']);
```

Replace the events table definition (lines 75-92):

```typescript
export const events = pgTable('events', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  coverImage: text('cover_image'),
  date: timestamp('date', { mode: 'date' }).notNull(),
  endDate: timestamp('end_date', { mode: 'date' }),
  location: text('location'),
  capacity: integer('capacity').notNull(),
  visibility: eventVisibilityEnum('visibility').notNull().default('private'),
  waitlistEnabled: boolean('waitlist_enabled').notNull().default(false),
  requireApproval: boolean('require_approval').notNull().default(false),
  status: eventStatusEnum('status').notNull().default('open'),
  inviteCode: text('invite_code').unique(),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

**Step 2: Push schema to database**

This is a destructive change (dropping enum values, renaming columns). We need to handle this carefully. First, run a SQL migration against the Supabase database to:

1. Create the new `event_visibility` enum
2. Add new columns (`visibility`, `waitlist_enabled`)
3. Migrate existing data
4. Drop old columns (`type`, `lottery_deadline`)
5. Update `event_status` enum (remove `draft`)
6. Update `registration_status` enum (remove `lottery_entered`)

Run this SQL migration against the Supabase project:

```sql
-- 1. Create new visibility enum
CREATE TYPE event_visibility AS ENUM ('private', 'public');

-- 2. Add new columns
ALTER TABLE events ADD COLUMN visibility event_visibility NOT NULL DEFAULT 'private';
ALTER TABLE events ADD COLUMN waitlist_enabled boolean NOT NULL DEFAULT false;

-- 3. Migrate existing data
UPDATE events SET visibility = 'private', waitlist_enabled = false WHERE type = 'invite_only';
UPDATE events SET visibility = 'public', waitlist_enabled = true WHERE type = 'waitlist';
UPDATE events SET visibility = 'public', waitlist_enabled = false, require_approval = true WHERE type = 'lottery';

-- Draft events become private
UPDATE events SET visibility = 'private' WHERE status = 'draft';
-- Open/closed/completed events that aren't already private (invite_only) become public
UPDATE events SET visibility = 'public' WHERE status IN ('open', 'closed', 'completed') AND type != 'invite_only';

-- Update draft status to open
UPDATE events SET status = 'open' WHERE status = 'draft';

-- Migrate lottery_entered registrations to pending_approval
UPDATE event_registrations SET status = 'pending_approval' WHERE status = 'lottery_entered';

-- 4. Drop old columns
ALTER TABLE events DROP COLUMN type;
ALTER TABLE events DROP COLUMN lottery_deadline;

-- 5. Update event_status enum (remove 'draft')
-- PostgreSQL doesn't support DROP VALUE from enum directly
-- We need to recreate: rename old, create new, migrate, drop old
ALTER TYPE event_status RENAME TO event_status_old;
CREATE TYPE event_status AS ENUM ('open', 'closed', 'completed');
ALTER TABLE events ALTER COLUMN status TYPE event_status USING status::text::event_status;
DROP TYPE event_status_old;

-- 6. Update registration_status enum (remove 'lottery_entered')
ALTER TYPE registration_status RENAME TO registration_status_old;
CREATE TYPE registration_status AS ENUM ('registered', 'waitlisted', 'selected', 'rejected', 'checked_in', 'no_show', 'pending_approval');
ALTER TABLE event_registrations ALTER COLUMN status TYPE registration_status USING status::text::registration_status;
DROP TYPE registration_status_old;

-- 7. Drop old event_type enum
DROP TYPE event_type;

-- 8. Generate invite codes for private events that don't have one
UPDATE events SET invite_code = substr(replace(gen_random_uuid()::text, '-', ''), 1, 12) WHERE visibility = 'private' AND invite_code IS NULL;
```

After running the SQL migration, run: `pnpm db:push` to sync Drizzle schema state.

**Step 3: Verify schema sync**

Run: `pnpm db:push`
Expected: No changes needed (schema already matches DB).

**Step 4: Commit**

```bash
git add lib/db/schema.ts
git commit -m "feat: update schema - replace event types with composable settings"
```

---

### Task 2: Update Validation Schemas

**Files:**
- Modify: `lib/validations/events.ts:1-28`

**Step 1: Rewrite validation schemas**

Replace the entire file:

```typescript
import { z } from 'zod';

export const createEventSchema = z.object({
  name: z.string().min(1, 'Event name is required').max(255),
  description: z.string().optional(),
  coverImage: z.string().optional().or(z.literal('')),
  date: z.coerce.date({ error: 'Event date is required' }),
  endDate: z.coerce.date().optional(),
  location: z.string().optional(),
  capacity: z.coerce.number().int().min(1, 'Capacity must be at least 1'),
  visibility: z.enum(['private', 'public']).default('private'),
  waitlistEnabled: z.coerce.boolean().default(false),
  requireApproval: z.coerce.boolean().default(false),
});

// Update schema: requireApproval is NOT included (locked at creation)
export const updateEventSchema = createEventSchema.omit({ requireApproval: true }).partial();

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
```

**Step 2: Verify build**

Run: `pnpm build`
Expected: Build errors in files that import old types — this is expected, we'll fix them next.

**Step 3: Commit**

```bash
git add lib/validations/events.ts
git commit -m "feat: update validation schemas for new event model"
```

---

### Task 3: Update Event Queries

**Files:**
- Modify: `lib/db/event-queries.ts:23-41` (getPublishedEvents)
- Modify: `lib/db/event-queries.ts:84-92` (getEventByInviteCode)
- Modify: `lib/db/event-queries.ts:219-304` (getUserEvents)

**Step 1: Update getPublishedEvents**

Replace lines 23-41. Filter by `visibility = 'public'` instead of `ne(status, 'draft')` and `ne(type, 'invite_only')`:

```typescript
export async function getPublishedEvents(filter?: 'upcoming' | 'past') {
  const now = new Date();
  const baseConditions = [
    eq(events.visibility, 'public'),
  ];

  if (filter === 'upcoming') {
    baseConditions.push(gte(events.date, now));
  } else if (filter === 'past') {
    baseConditions.push(lt(events.date, now));
  }

  const orderDir = filter === 'past' ? desc(events.date) : events.date;

  return db.select().from(events)
    .where(and(...baseConditions))
    .orderBy(orderDir);
}
```

**Step 2: Update getEventByInviteCode**

Replace lines 84-92. Remove the `eq(events.type, 'invite_only')` filter — now any private event can have an invite code:

```typescript
export async function getEventByInviteCode(code: string): Promise<Event | null> {
  const [event] = await db.select().from(events)
    .where(eq(events.inviteCode, code))
    .limit(1);
  return event || null;
}
```

**Step 3: Update getUserEvents**

Replace lines 219-304. Remove `ne(events.status, 'draft')` and `eq(events.type, 'invite_only')` references. Private events are shown via `event_access`, public events are shown via registrations:

```typescript
export async function getUserEvents(userId: string, filter?: 'upcoming' | 'past') {
  const now = new Date();

  const conditions = [
    eq(eventRegistrations.userId, userId),
  ];

  if (filter === 'upcoming') {
    conditions.push(gte(events.date, now));
  } else if (filter === 'past') {
    conditions.push(lt(events.date, now));
  }

  // Subquery: count confirmed registrations per event
  const confirmedCounts = db
    .select({
      eventId: eventRegistrations.eventId,
      count: count().as('confirmed_count'),
    })
    .from(eventRegistrations)
    .where(
      inArray(eventRegistrations.status, ['registered', 'selected', 'checked_in'])
    )
    .groupBy(eventRegistrations.eventId)
    .as('confirmed_counts');

  // Registered events
  const registeredRows = await db
    .select({
      event: events,
      registrationStatus: eventRegistrations.status,
      registeredCount: confirmedCounts.count,
    })
    .from(eventRegistrations)
    .innerJoin(events, eq(eventRegistrations.eventId, events.id))
    .leftJoin(confirmedCounts, eq(events.id, confirmedCounts.eventId))
    .where(and(...conditions))
    .orderBy(filter === 'past' ? desc(events.date) : events.date);

  // Accessed private events (where user has access but no registration)
  const accessConditions = [
    eq(eventAccess.userId, userId),
    eq(events.visibility, 'private'),
  ];

  if (filter === 'upcoming') {
    accessConditions.push(gte(events.date, now));
  } else if (filter === 'past') {
    accessConditions.push(lt(events.date, now));
  }

  const accessedRows = await db
    .select({
      event: events,
      registeredCount: confirmedCounts.count,
    })
    .from(eventAccess)
    .innerJoin(events, eq(eventAccess.eventId, events.id))
    .leftJoin(confirmedCounts, eq(events.id, confirmedCounts.eventId))
    .where(and(...accessConditions));

  // Merge: accessed events that aren't already in registered list
  const registeredEventIds = new Set(registeredRows.map(r => r.event.id));
  const accessOnly = accessedRows
    .filter(r => !registeredEventIds.has(r.event.id))
    .map(r => ({
      event: r.event,
      registrationStatus: null as string | null,
      registeredCount: r.registeredCount ?? 0,
    }));

  const all = [...registeredRows, ...accessOnly];
  all.sort((a, b) => {
    const dateA = new Date(a.event.date).getTime();
    const dateB = new Date(b.event.date).getTime();
    return filter === 'past' ? dateB - dateA : dateA - dateB;
  });

  return all.map((row) => ({
    event: row.event,
    registrationStatus: row.registrationStatus,
    registeredCount: row.registeredCount ?? 0,
  }));
}
```

**Step 4: Commit**

```bash
git add lib/db/event-queries.ts
git commit -m "feat: update event queries for visibility-based filtering"
```

---

### Task 4: Rewrite Server Actions

**Files:**
- Modify: `app/actions/events.ts:1-359`

**Step 1: Rewrite the entire server actions file**

Key changes:
- `createEventAction`: Remove type/lotteryDeadline handling. Auto-generate invite code for private events. Don't allow `status` to be set (always starts `open`).
- `updateEventAction`: Strip `requireApproval` from updates. Handle invite code when toggling visibility. Remove type-based logic.
- `registerForEvent`: Remove type-based branching. Use `requireApproval` and `waitlistEnabled` instead.
- `cancelRegistration`: Remove type-based waitlist check. Use `waitlistEnabled` instead.
- `runLottery`: Change filter from `lottery_entered` to `pending_approval`.
- `closeEvent`: Unchanged.
- `accessEventByInviteCode`: Remove `event.status === 'draft'` check (no more draft). Check `visibility === 'private'` optionally.
- `regenerateInviteCode`: Change check from `type !== 'invite_only'` to `visibility !== 'private'`.
- Remove `closeRegistration` action (new) — sets event status to `closed`.

```typescript
'use server';

import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';
import {
  createEvent as dbCreateEvent,
  updateEvent as dbUpdateEvent,
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
} from '@/lib/db/event-queries';
import { createEventSchema, updateEventSchema } from '@/lib/validations/events';

export async function createEventAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const raw = Object.fromEntries(formData);
  const parsed = createEventSchema.parse({
    ...raw,
    capacity: Number(raw.capacity),
    requireApproval: raw.requireApproval === 'true',
    waitlistEnabled: raw.waitlistEnabled === 'true',
  });

  // Auto-generate invite code for private events
  const inviteCode = parsed.visibility === 'private'
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    : null;

  const event = await dbCreateEvent({
    ...parsed,
    coverImage: parsed.coverImage || null,
    description: parsed.description || null,
    location: parsed.location || null,
    endDate: parsed.endDate || null,
    inviteCode,
    status: 'open',
    createdBy: session.user.id,
  });

  revalidatePath('/admin/events');
  revalidatePath('/user/events');
  return event;
}

export async function updateEventAction(eventId: string, formData: FormData) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const raw = Object.fromEntries(formData);
  const parsed = updateEventSchema.parse({
    ...raw,
    capacity: raw.capacity ? Number(raw.capacity) : undefined,
    waitlistEnabled: raw.waitlistEnabled !== undefined ? raw.waitlistEnabled === 'true' : undefined,
  });

  // Handle invite code when visibility changes
  let inviteCode: string | null | undefined;
  if (parsed.visibility === 'private') {
    const existing = await getEventById(eventId);
    if (!existing?.inviteCode) {
      inviteCode = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    }
  } else if (parsed.visibility === 'public') {
    // Keep invite code even when going public (existing links still work)
  }

  const event = await dbUpdateEvent(eventId, {
    ...parsed,
    coverImage: parsed.coverImage || null,
    description: parsed.description || null,
    location: parsed.location || null,
    endDate: parsed.endDate || null,
    ...(inviteCode !== undefined && { inviteCode }),
  });

  revalidatePath('/admin/events');
  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath('/user/events');
  return event;
}

export async function registerForEvent(eventId: string) {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');

  const event = await getEventById(eventId);
  if (!event || event.status !== 'open') {
    throw new Error('Event not available for registration');
  }

  // For private events, verify user has access
  if (event.visibility === 'private') {
    const access = await hasEventAccess(session.user.id, eventId);
    if (!access) throw new Error('You do not have access to this event');
  }

  const existing = await getUserRegistration(session.user.id, eventId);
  if (existing) throw new Error('Already registered');

  // Require approval — always pending_approval
  if (event.requireApproval) {
    await createRegistration({
      userId: session.user.id,
      eventId,
      status: 'pending_approval',
    });
    revalidatePath(`/user/events/${eventId}`);
    revalidatePath(`/admin/events/${eventId}`);
    return;
  }

  // FCFS registration
  const confirmedCount = await getRegistrationCount(eventId, ['registered', 'checked_in']);

  if (confirmedCount < event.capacity) {
    await createRegistration({
      userId: session.user.id,
      eventId,
      status: 'registered',
    });
  } else if (event.waitlistEnabled) {
    await createRegistration({
      userId: session.user.id,
      eventId,
      status: 'waitlisted',
    });
  } else {
    throw new Error('Event is full');
  }

  revalidatePath(`/user/events/${eventId}`);
  revalidatePath(`/admin/events/${eventId}`);
}

export async function cancelRegistration(eventId: string) {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');

  await deleteRegistration(session.user.id, eventId);

  // If waitlist enabled, promote next person
  const event = await getEventById(eventId);
  if (event?.waitlistEnabled && !event.requireApproval) {
    const regs = await getEventRegistrations(eventId);
    const waitlisted = regs.filter(r => r.registration.status === 'waitlisted');
    if (waitlisted.length > 0) {
      const confirmedCount = await getRegistrationCount(eventId, ['registered', 'checked_in']);
      if (confirmedCount < event.capacity) {
        await updateRegistration(waitlisted[0].registration.id, { status: 'registered' });
      }
    }
  }

  revalidatePath(`/user/events/${eventId}`);
  revalidatePath(`/admin/events/${eventId}`);
}

export async function runLottery(eventId: string) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const event = await getEventById(eventId);
  if (!event || !event.requireApproval) throw new Error('Lottery only available for approval-required events');

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

  // Update statuses and snapshot scores
  const updates = entrants.map(async (entry) => {
    const isSelected = selectedIds.has(entry.registration.id);
    const entryScore = scored.find(s => s.registration.id === entry.registration.id)!.score;
    await updateRegistration(entry.registration.id, {
      status: isSelected ? 'selected' : 'rejected',
      lotteryPriorityScore: entryScore,
    });
  });
  await Promise.all(updates);

  // Write lottery history
  const historyEntries = entrants.map(entry => ({
    userId: entry.user.id,
    eventId,
    outcome: selectedIds.has(entry.registration.id) ? 'won' as const : 'lost' as const,
  }));
  await createLotteryHistoryEntries(historyEntries);

  // Close registration after lottery
  await dbUpdateEvent(eventId, { status: 'closed' });

  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath(`/user/events/${eventId}`);

  return {
    selected: selected.map(s => ({ name: s.user.name, email: s.user.email, score: s.score })),
    rejected: pool.map(s => ({ name: s.user.name, email: s.user.email, score: s.score })),
  };
}

export async function closeRegistration(eventId: string) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const event = await getEventById(eventId);
  if (!event || event.status !== 'open') throw new Error('Event is not open');

  await dbUpdateEvent(eventId, { status: 'closed' });

  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath('/admin/events');
}

export async function checkinAttendee(registrationId: string, eventId: string) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  await updateRegistration(registrationId, { status: 'checked_in' });
  revalidatePath(`/admin/events/${eventId}/checkin`);
}

export async function undoCheckin(registrationId: string, eventId: string, previousStatus: 'registered' | 'selected') {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  await updateRegistration(registrationId, { status: previousStatus });
  revalidatePath(`/admin/events/${eventId}/checkin`);
}

export async function closeEvent(eventId: string) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  await bulkMarkNoShow(eventId);
  await dbUpdateEvent(eventId, { status: 'completed' });

  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath('/admin/events');
  revalidatePath('/admin');
}

export async function removeRegistration(registrationId: string, eventId: string) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const regs = await getEventRegistrations(eventId);
  const reg = regs.find(r => r.registration.id === registrationId);
  if (!reg) throw new Error('Registration not found');

  await deleteRegistration(reg.user.id, eventId);
  revalidatePath(`/admin/events/${eventId}`);
}

async function getPendingRegistration(registrationId: string, eventId: string) {
  const regs = await getEventRegistrations(eventId);
  const reg = regs.find(r => r.registration.id === registrationId);
  if (!reg) throw new Error('Registration not found');
  if (reg.registration.status !== 'pending_approval') {
    throw new Error('Registration is not pending approval');
  }
  return reg;
}

export async function approveRegistration(registrationId: string, eventId: string) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const event = await getEventById(eventId);
  if (!event) throw new Error('Event not found');

  await getPendingRegistration(registrationId, eventId);

  // Check capacity before approving
  const confirmedCount = await getRegistrationCount(eventId, ['registered', 'selected', 'checked_in']);
  if (confirmedCount >= event.capacity) {
    throw new Error('Event is at capacity');
  }

  await updateRegistration(registrationId, { status: 'registered' });

  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath(`/user/events/${eventId}`);
}

export async function denyRegistration(registrationId: string, eventId: string) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  await getPendingRegistration(registrationId, eventId);
  await updateRegistration(registrationId, { status: 'rejected' });

  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath(`/user/events/${eventId}`);
}

export async function accessEventByInviteCode(code: string) {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');

  const event = await getEventByInviteCode(code);
  if (!event) throw new Error('Invalid invite code');

  await createEventAccess(session.user.id, event.id);
  return event.id;
}

export async function regenerateInviteCode(eventId: string) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const event = await getEventById(eventId);
  if (!event || event.visibility !== 'private') {
    throw new Error('Can only regenerate invite codes for private events');
  }

  const newCode = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  await dbUpdateEvent(eventId, { inviteCode: newCode });

  revalidatePath(`/admin/events/${eventId}`);
  return newCode;
}
```

**Step 2: Commit**

```bash
git add app/actions/events.ts
git commit -m "feat: rewrite server actions for composable event settings"
```

---

### Task 5: Update Event Form Component

**Files:**
- Modify: `components/admin/event-form.tsx:1-259`

**Step 1: Rewrite the event form**

Key changes:
- Remove: eventType state, lotteryDeadline state, status state
- Add: visibility state, waitlistEnabled state
- Replace type selector with visibility toggle (Private/Public)
- Replace status selector (removed — events always start `open`)
- Show waitlist toggle conditionally (when capacity is set and require approval is off)
- Make requireApproval read-only in edit mode
- Add helper text under "Require Approval": "Includes manual selection & lottery-based"

```typescript
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { MapPin, FileText, Users, Eye, ListChecks, ShieldCheck } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { createEventAction, updateEventAction } from '@/app/actions/events';
import { CoverImagePicker } from '@/components/admin/cover-image-picker';
import { TiptapEditor } from '@/components/admin/tiptap-editor';
import { DateTimePicker, TimezonePicker } from '@/components/admin/date-time-picker';
import type { Event } from '@/lib/db/schema';

export function EventForm({ event }: { event?: Event }) {
  const [coverImage, setCoverImage] = useState<string>(event?.coverImage || '');
  const [name, setName] = useState(event?.name || '');
  const [startDate, setStartDate] = useState<Date | undefined>(
    event?.date ? new Date(event.date) : undefined
  );
  const [endDate, setEndDate] = useState<Date | undefined>(
    event?.endDate ? new Date(event.endDate) : undefined
  );
  const [location, setLocation] = useState(event?.location || '');
  const [description, setDescription] = useState(event?.description || '');
  const [visibility, setVisibility] = useState<'private' | 'public'>(
    event?.visibility || 'private'
  );
  const [capacity, setCapacity] = useState<string>(
    event?.capacity ? String(event.capacity) : ''
  );
  const [waitlistEnabled, setWaitlistEnabled] = useState(
    event?.waitlistEnabled ?? false
  );
  const [requireApproval, setRequireApproval] = useState(
    event?.requireApproval ?? false
  );
  const [timezone, setTimezone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone
  );

  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const isEditing = !!event;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const formData = new FormData();
    formData.set('name', name);
    formData.set('coverImage', coverImage);
    formData.set('description', description);
    formData.set('location', location);
    formData.set('capacity', capacity);
    formData.set('visibility', visibility);
    formData.set('waitlistEnabled', String(waitlistEnabled));
    if (!isEditing) {
      formData.set('requireApproval', String(requireApproval));
    }

    if (startDate) formData.set('date', startDate.toISOString());
    if (endDate) formData.set('endDate', endDate.toISOString());

    startTransition(async () => {
      try {
        if (event) {
          await updateEventAction(event.id, formData);
          toast.success('Event updated');
        } else {
          const created = await createEventAction(formData);
          toast.success('Event created');
          router.push(`/admin/events/${created.id}`);
        }
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Failed to save event'
        );
      }
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid gap-6 md:gap-8 md:grid-cols-[minmax(280px,420px)_1fr]">
        {/* Left: Cover Image */}
        <CoverImagePicker value={coverImage || null} onChange={setCoverImage} />

        {/* Right: Form Fields */}
        <div className="space-y-4">
          {/* Event Name */}
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Event Name"
            className="border-0 text-4xl md:text-5xl font-bold placeholder:text-muted-foreground/30 focus-visible:ring-0 p-0 h-auto tracking-tight leading-tight"
            required
          />

          {/* Date/Time Section */}
          <div className="rounded-xl border bg-muted/30 px-2.5 py-2 sm:px-3 sm:py-2.5">
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <div className="flex-1 space-y-1.5">
                <DateTimePicker
                  label="Start"
                  value={startDate}
                  onChange={setStartDate}
                />
                <DateTimePicker
                  label="End"
                  value={endDate}
                  onChange={setEndDate}
                />
              </div>
              <div className="self-center sm:self-auto">
                <TimezonePicker value={timezone} onChange={setTimezone} />
              </div>
            </div>
          </div>

          {/* Location */}
          <div className="flex items-center gap-3 rounded-xl border bg-muted/30 px-3 py-2.5 sm:px-4 sm:py-3">
            <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Add Event Location"
              className="border-0 bg-transparent p-0 h-auto text-sm focus-visible:ring-0 placeholder:text-muted-foreground"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold">Description</span>
            </div>
            <TiptapEditor
              content={description}
              onChange={setDescription}
              placeholder="Add Description"
            />
          </div>

          {/* Event Options */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">
              Event Options
            </h3>
            <div className="rounded-xl border divide-y">
              {/* Visibility */}
              <div className="flex items-center justify-between px-3 sm:px-4 py-2">
                <div className="flex items-center gap-2.5">
                  <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm">Visibility</span>
                </div>
                <Select value={visibility} onValueChange={(v) => setVisibility(v as 'private' | 'public')}>
                  <SelectTrigger className="w-[110px] h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="private">Private</SelectItem>
                    <SelectItem value="public">Public</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Capacity */}
              <div className="flex items-center justify-between px-3 sm:px-4 py-2">
                <div className="flex items-center gap-2.5">
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm">Capacity</span>
                </div>
                <Input
                  type="number"
                  min={1}
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  placeholder="e.g. 50"
                  className="w-[110px] h-7 text-xs text-right"
                  required
                />
              </div>

              {/* Waitlist (conditional: shown when capacity is set and approval is off) */}
              {capacity && !requireApproval && (
                <div className="flex items-center justify-between px-3 sm:px-4 py-2">
                  <div className="flex items-center gap-2.5">
                    <ListChecks className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm">Enable Waitlist</span>
                  </div>
                  <Switch
                    checked={waitlistEnabled}
                    onCheckedChange={setWaitlistEnabled}
                  />
                </div>
              )}

              {/* Require Approval */}
              <div className="flex items-center justify-between px-3 sm:px-4 py-2">
                <div className="flex items-center gap-2.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
                  <div>
                    <span className="text-sm">Require Approval</span>
                    <p className="text-[11px] text-muted-foreground">Includes manual selection & lottery-based</p>
                  </div>
                </div>
                {isEditing ? (
                  <span className="text-xs text-muted-foreground">
                    {requireApproval ? 'On' : 'Off'}
                  </span>
                ) : (
                  <Switch
                    checked={requireApproval}
                    onCheckedChange={setRequireApproval}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Submit */}
          <Button
            type="submit"
            size="lg"
            className="w-full rounded-xl"
            disabled={isPending}
          >
            {isPending
              ? 'Saving...'
              : event
                ? 'Update Event'
                : 'Create Event'}
          </Button>
        </div>
      </div>
    </form>
  );
}
```

**Step 2: Commit**

```bash
git add components/admin/event-form.tsx
git commit -m "feat: update event form with visibility, waitlist toggle, locked approval"
```

---

### Task 6: Update Admin Event Detail Page

**Files:**
- Modify: `app/(admin)/admin/events/[id]/page.tsx:1-76`

**Step 1: Rewrite admin event detail page**

Key changes:
- Show `InviteLinkCard` for private events (was `invite_only`)
- Show `LotteryDraw` for approval-required events with pending requests (was `lottery` type)
- Add "Close Registration" button when event is `open`
- Change `entrantCount` to count `pending_approval` instead of `lottery_entered`
- Pass `showPriority` based on `requireApproval` instead of `type === 'lottery'`

```typescript
import { auth } from '@/auth';
import { redirect, notFound } from 'next/navigation';
import { getEventById, getEventRegistrations } from '@/lib/db/event-queries';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { EventForm } from '@/components/admin/event-form';
import { RegistrationsTable } from '@/components/admin/registrations-table';
import { LotteryDraw } from '@/components/admin/lottery-draw';
import { InviteLinkCard } from '@/components/admin/invite-link-card';
import { CloseRegistrationButton } from '@/components/admin/close-registration-button';
import Link from 'next/link';
import { ClipboardCheck } from 'lucide-react';

export default async function AdminEventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (!session.user.isAdmin) redirect('/user');

  const { id } = await params;
  const event = await getEventById(id);
  if (!event) notFound();

  const registrations = await getEventRegistrations(id);
  const pendingCount = registrations.filter(r => r.registration.status === 'pending_approval').length;

  return (
    <>
      <PageHeader
        title={event.name}
        showSidebarTrigger
        actions={
          <Link href={`/admin/events/${id}/checkin`}>
            <Button variant="outline" size="sm">
              <ClipboardCheck className="h-4 w-4 mr-1" />
              Check-in
            </Button>
          </Link>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-4 py-6">
          {event.visibility === 'private' && event.inviteCode && (
            <InviteLinkCard eventId={id} inviteCode={event.inviteCode} />
          )}

          <Tabs defaultValue="registrations">
            <TabsList>
              <TabsTrigger value="registrations">
                Registrations ({registrations.length})
              </TabsTrigger>
              <TabsTrigger value="edit">Edit Event</TabsTrigger>
            </TabsList>

            <TabsContent value="registrations" className="mt-6">
              <div className="flex items-center gap-2 mb-6">
                {event.requireApproval && event.status === 'open' && (
                  <LotteryDraw eventId={id} entrantCount={pendingCount} />
                )}
                {event.status === 'open' && (
                  <CloseRegistrationButton eventId={id} />
                )}
              </div>
              <RegistrationsTable
                registrations={registrations}
                eventId={id}
                showApprovalActions={event.requireApproval}
                showPriority={event.requireApproval}
              />
            </TabsContent>

            <TabsContent value="edit" className="mt-6">
              <EventForm event={event} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </>
  );
}
```

**Step 2: Create CloseRegistrationButton component**

Create file: `components/admin/close-registration-button.tsx`

```typescript
'use client';

import { Button } from '@/components/ui/button';
import { closeRegistration } from '@/app/actions/events';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Lock } from 'lucide-react';

export function CloseRegistrationButton({ eventId }: { eventId: string }) {
  const [isPending, startTransition] = useTransition();

  const handleClose = () => {
    startTransition(async () => {
      try {
        await closeRegistration(eventId);
        toast.success('Registration closed');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to close registration');
      }
    });
  };

  return (
    <Button variant="outline" onClick={handleClose} disabled={isPending} className="gap-2">
      <Lock className="h-4 w-4" />
      {isPending ? 'Closing...' : 'Close Registration'}
    </Button>
  );
}
```

**Step 3: Commit**

```bash
git add app/(admin)/admin/events/[id]/page.tsx components/admin/close-registration-button.tsx
git commit -m "feat: update admin event detail for new event model"
```

---

### Task 7: Update Admin Events List Page

**Files:**
- Modify: `app/(admin)/admin/events/page.tsx:10-15,62-69`

**Step 1: Update status colors and badges**

Remove `draft` from statusColors. Replace the `event.type` badge with a visibility badge:

In statusColors (line 10-15), remove `draft`:
```typescript
const statusColors: Record<string, string> = {
  open: 'bg-green-500/10 text-green-500 border-green-500/20',
  closed: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  completed: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
};
```

In the event card badges section (around line 66-69), replace `event.type` badge:
```typescript
<Badge variant="outline" className={statusColors[event.status] || ''}>
  {event.status}
</Badge>
<Badge variant="outline">
  {event.visibility}
</Badge>
```

**Step 2: Commit**

```bash
git add app/(admin)/admin/events/page.tsx
git commit -m "feat: update admin events list for new event model"
```

---

### Task 8: Update Registrations Table Component

**Files:**
- Modify: `components/admin/registrations-table.tsx:26-44`

**Step 1: Update status colors and props**

Remove `lottery_entered` from statusColors (line 29). Update the component props to accept `showApprovalActions` instead of inferring from status:

Remove this line from `statusColors`:
```
lottery_entered: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
```

Update props interface (line 37-44) to use `showApprovalActions`:
```typescript
export function RegistrationsTable({
  registrations,
  eventId,
  showApprovalActions,
  showPriority,
}: {
  registrations: Registration[];
  eventId: string;
  showApprovalActions?: boolean;
  showPriority?: boolean;
}) {
```

Update the inline action buttons (around line 117) to check `showApprovalActions && registration.status === 'pending_approval'` instead of just `registration.status === 'pending_approval'`:

```typescript
{showApprovalActions && registration.status === 'pending_approval' ? (
```

**Step 2: Commit**

```bash
git add components/admin/registrations-table.tsx
git commit -m "feat: update registrations table for new event model"
```

---

### Task 9: Update LotteryDraw Component

**Files:**
- Modify: `components/admin/lottery-draw.tsx:42,50-52`

**Step 1: Update button label and description**

Change "Run Lottery ({entrantCount} entrants)" to "Run Lottery ({entrantCount} pending)" (line 42):

```typescript
Run Lottery ({entrantCount} pending)
```

Update dialog description (lines 50-52):
```typescript
<DialogDescription>
  This will select winners from {entrantCount} pending requests using weighted random selection.
  Priority scores: base 1.0, +0.5 per past loss, -1.5 per past no-show.
  This action cannot be undone.
</DialogDescription>
```

**Step 2: Commit**

```bash
git add components/admin/lottery-draw.tsx
git commit -m "feat: update lottery draw labels for pending requests"
```

---

### Task 10: Update User Event Detail Page

**Files:**
- Modify: `app/(user)/user/events/[id]/page.tsx:32-38,115-123`

**Step 1: Update access checks and remove lottery deadline**

Replace the draft check and invite_only access check (lines 32-38):
```typescript
if (!event) notFound();

// Access check for private events
if (event.visibility === 'private') {
  const access = await hasEventAccess(session.user.id, id);
  if (!access) notFound();
}
```

Remove the lottery deadline section (lines 115-123) entirely.

**Step 2: Commit**

```bash
git add app/(user)/user/events/[id]/page.tsx
git commit -m "feat: update user event detail for visibility-based access"
```

---

### Task 11: Update Event Registration Button

**Files:**
- Modify: `components/user/event-registration-button.tsx:1-164`

**Step 1: Rewrite the registration button**

Simplify by removing type-based branching. Two paths: approval ON vs approval OFF.

```typescript
'use client';

import { Button } from '@/components/ui/button';
import { registerForEvent, cancelRegistration } from '@/app/actions/events';
import { useTransition } from 'react';
import { toast } from 'sonner';
import type { Event, EventRegistration } from '@/lib/db/schema';

interface Props {
  event: Event;
  registration: EventRegistration | null;
  spotsRemaining: number;
}

export function EventRegistrationButton({ event, registration, spotsRemaining }: Props) {
  const [isPending, startTransition] = useTransition();

  const handleRegister = () => {
    startTransition(async () => {
      try {
        await registerForEvent(event.id);
        if (event.requireApproval) {
          toast.success('Access requested! Waiting for admin approval.');
        } else if (spotsRemaining > 0) {
          toast.success("You're registered!");
        } else {
          toast.success('Added to waitlist!');
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Registration failed');
      }
    });
  };

  const handleCancel = () => {
    startTransition(async () => {
      try {
        await cancelRegistration(event.id);
        toast.success('Registration cancelled');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to cancel');
      }
    });
  };

  // Already has a registration record
  if (registration) {
    const statusLabels: Record<string, string> = {
      registered: "You're In",
      waitlisted: "You're on the Waitlist",
      selected: "You've Been Selected",
      rejected: 'Not Selected',
      checked_in: 'Checked In',
      no_show: 'Marked as No-Show',
      pending_approval: 'Pending Approval',
    };

    const canCancel = ['registered', 'waitlisted', 'pending_approval'].includes(registration.status);

    return (
      <div className="space-y-2">
        <Button
          size="lg"
          className="w-full rounded-xl text-lg"
          variant={
            registration.status === 'rejected' || registration.status === 'no_show'
              ? 'destructive'
              : registration.status === 'pending_approval'
                ? 'secondary'
                : 'default'
          }
          disabled
        >
          {statusLabels[registration.status] || registration.status}
        </Button>
        {canCancel && (
          <Button
            variant="outline"
            size="sm"
            className="w-full rounded-xl"
            onClick={handleCancel}
            disabled={isPending}
          >
            {registration.status === 'pending_approval' ? 'Cancel Request' : 'Cancel Registration'}
          </Button>
        )}
      </div>
    );
  }

  // Event closed or completed
  if (event.status === 'closed' || event.status === 'completed') {
    return (
      <Button size="lg" className="w-full rounded-xl text-lg" disabled>
        Event Closed
      </Button>
    );
  }

  // Require approval — show "Request Access"
  if (event.requireApproval) {
    return (
      <Button
        size="lg"
        className="w-full rounded-xl text-lg"
        disabled={isPending}
        onClick={handleRegister}
      >
        {isPending ? 'Requesting...' : 'Request Access'}
      </Button>
    );
  }

  // FCFS — no approval
  if (spotsRemaining <= 0 && !event.waitlistEnabled) {
    return (
      <Button size="lg" className="w-full rounded-xl text-lg" disabled>
        Event Full
      </Button>
    );
  }

  return (
    <Button
      size="lg"
      className="w-full rounded-xl text-lg"
      disabled={isPending}
      onClick={handleRegister}
    >
      {isPending ? 'Registering...' : spotsRemaining > 0 ? 'RSVP' : 'Join Waitlist'}
    </Button>
  );
}
```

**Step 2: Commit**

```bash
git add components/user/event-registration-button.tsx
git commit -m "feat: simplify registration button for composable event settings"
```

---

### Task 12: Update Event Card & Invite Page

**Files:**
- Modify: `components/user/event-card.tsx:24-25`
- Modify: `app/invite/[code]/page.tsx:8`

**Step 1: Update event card status badge**

Remove the `lottery_entered` case from `getStatusBadge` (lines 24-25 in `event-card.tsx`):

Delete:
```typescript
    case 'lottery_entered':
      return { label: 'Lottery Entered', className: 'bg-purple-500/15 text-purple-700 border-purple-500/25 dark:text-purple-400' };
```

**Step 2: Update invite page**

In `app/invite/[code]/page.tsx`, line 8, remove the `event.status === 'draft'` check since draft no longer exists:

```typescript
if (!event) notFound();
```

**Step 3: Commit**

```bash
git add components/user/event-card.tsx app/invite/[code]/page.tsx
git commit -m "feat: update event card and invite page for new event model"
```

---

### Task 13: Build Verification & Cleanup

**Step 1: Run build**

Run: `pnpm build`
Expected: Build succeeds with no type errors.

**Step 2: Fix any remaining type errors**

Check for any remaining references to old fields (`event.type`, `event.lotteryDeadline`, `event.status === 'draft'`, `lottery_entered`) and fix them.

Run: `grep -r "event\.type\|lotteryDeadline\|lottery_entered\|event_type\|'draft'" --include="*.ts" --include="*.tsx" lib/ app/ components/`

Expected: No matches (all references should be cleaned up by previous tasks).

**Step 3: Push schema to database**

Run: `pnpm db:push`
Expected: Schema is in sync (migration was already applied in Task 1).

**Step 4: Commit any remaining fixes**

```bash
git add -A
git commit -m "chore: cleanup remaining references to old event type model"
```

---

### Task 14: Manual Testing Checklist

Verify these flows work correctly:

1. **Create event (private, no approval)** — should auto-generate invite code, be hidden from public listings
2. **Create event (public, with approval)** — should appear in listings, users see "Request Access"
3. **Create event (public, no approval, with waitlist)** — FCFS with waitlist overflow
4. **Toggle visibility** on existing event — private↔public works, invite code persists
5. **Register for FCFS event** — immediate registration
6. **Register for approval event** — pending_approval status
7. **Admin approves/denies** — status changes correctly
8. **Admin runs lottery** — selects from pending pool, closes registration
9. **Close registration manually** — new registrations blocked
10. **Complete event** — no-shows marked
11. **Invite link flow** — private event accessible via invite link
12. **Require approval is read-only on edit** — cannot toggle after creation
