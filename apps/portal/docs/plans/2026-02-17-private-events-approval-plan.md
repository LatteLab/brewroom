# Private Events & Require Approval Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add invite-only private events and a "Require Approval" toggle to the event system.

**Architecture:** Extend existing schema with new enum values, two new columns on `events`, a new `event_access` table, and new server actions. The invite flow uses a thin redirect page at `/invite/[code]` that creates access records and redirects to the event detail page.

**Tech Stack:** Next.js 16, Drizzle ORM, Supabase PostgreSQL, shadcn/ui, Zod

**Worktree:** `.worktrees/private-events` (branch: `feature/private-events-approval`)

---

### Task 1: Database Schema Changes

**Files:**
- Modify: `lib/db/schema.ts`

**Step 1: Update enums and events table**

Add `invite_only` to `eventTypeEnum`, `pending_approval` to `registrationStatusEnum`, and add `requireApproval` + `inviteCode` columns to `events` table. Add new `eventAccess` table.

```typescript
// In schema.ts — update enums
export const eventTypeEnum = pgEnum('event_type', ['waitlist', 'lottery', 'invite_only']);
export const registrationStatusEnum = pgEnum('registration_status', [
  'registered', 'waitlisted', 'lottery_entered', 'selected', 'rejected', 'checked_in', 'no_show', 'pending_approval'
]);
```

Add to imports: `import { pgTable, pgEnum, text, timestamp, uuid, primaryKey, integer, real, unique, boolean } from 'drizzle-orm/pg-core';`

Add columns to `events` table:
```typescript
requireApproval: boolean('require_approval').notNull().default(false),
inviteCode: text('invite_code').unique(),
```

Add new table after `events`:
```typescript
export const eventAccess = pgTable('event_access', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  userEventUnique: unique().on(table.userId, table.eventId),
}));
```

Add type exports:
```typescript
export type EventAccess = typeof eventAccess.$inferSelect;
export type NewEventAccess = typeof eventAccess.$inferInsert;
```

**Step 2: Apply migration via Supabase**

Use the Supabase MCP `apply_migration` tool to run the DDL:

```sql
-- Add new enum values
ALTER TYPE event_type ADD VALUE 'invite_only';
ALTER TYPE registration_status ADD VALUE 'pending_approval';

-- Add columns to events
ALTER TABLE events ADD COLUMN require_approval boolean NOT NULL DEFAULT false;
ALTER TABLE events ADD COLUMN invite_code text UNIQUE;

-- Create event_access table
CREATE TABLE event_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  created_at timestamp DEFAULT now() NOT NULL,
  UNIQUE(user_id, event_id)
);
```

**Step 3: Push schema locally**

Run: `pnpm db:push`

**Step 4: Verify build**

Run: `pnpm build`
Expected: Successful build with no type errors.

**Step 5: Commit**

```bash
git add lib/db/schema.ts
git commit -m "feat: add invite_only event type, pending_approval status, and event_access table"
```

---

### Task 2: Validation Schema Updates

**Files:**
- Modify: `lib/validations/events.ts`

**Step 1: Update Zod schema**

Update `createEventSchema` to support `invite_only` type and `requireApproval`:

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
  type: z.enum(['waitlist', 'lottery', 'invite_only']),
  lotteryDeadline: z.coerce.date().optional(),
  status: z.enum(['draft', 'open']).default('draft'),
  requireApproval: z.coerce.boolean().default(false),
}).refine(
  (data) => {
    if (data.type === 'lottery' && !data.lotteryDeadline) {
      return false;
    }
    return true;
  },
  { message: 'Lottery deadline is required for lottery events', path: ['lotteryDeadline'] }
);

export const updateEventSchema = createEventSchema.partial();

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
```

**Step 2: Verify build**

Run: `pnpm build`

**Step 3: Commit**

```bash
git add lib/validations/events.ts
git commit -m "feat: add invite_only and requireApproval to event validation schema"
```

---

### Task 3: Event Query Helpers

**Files:**
- Modify: `lib/db/event-queries.ts`

**Step 1: Add event_access imports and queries**

Add `eventAccess` to the import from `./schema`. Add `or` to the drizzle-orm import.

Add these new query functions:

```typescript
// ============================================================================
// Event Access Queries (for invite-only events)
// ============================================================================

export async function createEventAccess(userId: string, eventId: string) {
  const [access] = await db.insert(eventAccess)
    .values({ userId, eventId })
    .onConflictDoNothing()
    .returning();
  return access;
}

export async function hasEventAccess(userId: string, eventId: string): Promise<boolean> {
  const [row] = await db.select({ id: eventAccess.id })
    .from(eventAccess)
    .where(and(
      eq(eventAccess.userId, userId),
      eq(eventAccess.eventId, eventId)
    ))
    .limit(1);
  return !!row;
}

export async function getEventByInviteCode(code: string): Promise<Event | null> {
  const [event] = await db.select().from(events)
    .where(eq(events.inviteCode, code))
    .limit(1);
  return event || null;
}
```

**Step 2: Update `getPublishedEvents` to filter out invite_only events**

Modify `getPublishedEvents` to exclude `invite_only` events from public listings. Add a `userId` parameter to optionally include invite_only events the user has access to:

```typescript
export async function getPublishedEvents(filter?: 'upcoming' | 'past', userId?: string) {
  const now = new Date();
  const baseConditions = [
    ne(events.status, 'draft'),
  ];

  if (filter === 'upcoming') {
    baseConditions.push(gte(events.date, now));
  } else if (filter === 'past') {
    baseConditions.push(lt(events.date, now));
  }

  // Exclude invite_only events (they are accessed via invite links only)
  baseConditions.push(ne(events.type, 'invite_only'));

  const orderDir = filter === 'past' ? desc(events.date) : desc(events.date);

  return db.select().from(events)
    .where(and(...baseConditions))
    .orderBy(orderDir);
}
```

**Step 3: Update `getUserEvents` to include invite_only events user has access to**

The existing `getUserEvents` query already joins through `eventRegistrations`, so users who have registered (or have `pending_approval`) will already see the event. But we also need users who have accessed the invite link but haven't registered yet to see it.

Add a new function `getUserAccessibleEvents` that combines registered events + accessed invite-only events:

```typescript
export async function getUserAccessedEventIds(userId: string): Promise<string[]> {
  const rows = await db.select({ eventId: eventAccess.eventId })
    .from(eventAccess)
    .where(eq(eventAccess.userId, userId));
  return rows.map(r => r.eventId);
}
```

**Step 4: Verify build**

Run: `pnpm build`

**Step 5: Commit**

```bash
git add lib/db/event-queries.ts
git commit -m "feat: add event access queries and invite code lookup"
```

---

### Task 4: Server Actions

**Files:**
- Modify: `app/actions/events.ts`

**Step 1: Update `createEventAction` to handle invite code generation**

Add `nanoid` import (or use `crypto.randomUUID().slice(0, 10)` to avoid new dependency). When creating an `invite_only` event, auto-generate an `inviteCode`.

At the top of the file, add:
```typescript
import {
  // ... existing imports ...
  getEventByInviteCode,
  createEventAccess,
  hasEventAccess,
} from '@/lib/db/event-queries';
```

Update `createEventAction`:
```typescript
export async function createEventAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const raw = Object.fromEntries(formData);
  const parsed = createEventSchema.parse({
    ...raw,
    capacity: Number(raw.capacity),
    requireApproval: raw.requireApproval === 'true',
  });

  const inviteCode = parsed.type === 'invite_only'
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    : null;

  const event = await dbCreateEvent({
    ...parsed,
    coverImage: parsed.coverImage || null,
    description: parsed.description || null,
    location: parsed.location || null,
    endDate: parsed.endDate || null,
    lotteryDeadline: parsed.lotteryDeadline || null,
    inviteCode,
    createdBy: session.user.id,
  });

  revalidatePath('/admin/events');
  revalidatePath('/user/events');
  return event;
}
```

Update `updateEventAction` to pass `requireApproval`:
```typescript
export async function updateEventAction(eventId: string, formData: FormData) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const raw = Object.fromEntries(formData);
  const parsed = updateEventSchema.parse({
    ...raw,
    capacity: raw.capacity ? Number(raw.capacity) : undefined,
    requireApproval: raw.requireApproval !== undefined ? raw.requireApproval === 'true' : undefined,
  });

  const event = await dbUpdateEvent(eventId, {
    ...parsed,
    coverImage: parsed.coverImage || null,
    description: parsed.description || null,
    location: parsed.location || null,
    endDate: parsed.endDate || null,
    lotteryDeadline: parsed.lotteryDeadline || null,
  });

  revalidatePath('/admin/events');
  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath('/user/events');
  return event;
}
```

**Step 2: Update `registerForEvent` to handle approval + invite_only**

```typescript
export async function registerForEvent(eventId: string) {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');

  const event = await getEventById(eventId);
  if (!event || event.status === 'draft' || event.status === 'completed') {
    throw new Error('Event not available for registration');
  }

  // For invite_only events, verify user has access
  if (event.type === 'invite_only') {
    const access = await hasEventAccess(session.user.id, eventId);
    if (!access) throw new Error('You do not have access to this event');
  }

  const existing = await getUserRegistration(session.user.id, eventId);
  if (existing) throw new Error('Already registered');

  // If require approval is on, create pending_approval registration
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

  if (event.type === 'lottery') {
    if (event.lotteryDeadline && new Date() > event.lotteryDeadline) {
      throw new Error('Lottery deadline has passed');
    }
    await createRegistration({
      userId: session.user.id,
      eventId,
      status: 'lottery_entered',
    });
  } else {
    // Waitlist or invite_only (FCFS)
    const confirmedCount = await getRegistrationCount(eventId, ['registered', 'checked_in']);
    const status = confirmedCount < event.capacity ? 'registered' : 'waitlisted';

    if (event.type === 'invite_only' && confirmedCount >= event.capacity) {
      throw new Error('Event is full');
    }

    await createRegistration({
      userId: session.user.id,
      eventId,
      status,
    });
  }

  revalidatePath(`/user/events/${eventId}`);
  revalidatePath(`/admin/events/${eventId}`);
}
```

**Step 3: Add new approval actions**

```typescript
export async function approveRegistration(registrationId: string, eventId: string) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const event = await getEventById(eventId);
  if (!event) throw new Error('Event not found');

  // Determine the appropriate status after approval
  let newStatus: 'registered' | 'lottery_entered' = 'registered';
  if (event.type === 'lottery') {
    newStatus = 'lottery_entered';
  }

  await updateRegistration(registrationId, { status: newStatus });

  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath(`/user/events/${eventId}`);
}

export async function denyRegistration(registrationId: string, eventId: string) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

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

  const newCode = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  await dbUpdateEvent(eventId, { inviteCode: newCode });

  revalidatePath(`/admin/events/${eventId}`);
  return newCode;
}
```

**Step 4: Verify build**

Run: `pnpm build`

**Step 5: Commit**

```bash
git add app/actions/events.ts
git commit -m "feat: add approval, invite access, and invite_only registration actions"
```

---

### Task 5: Invite Redirect Page

**Files:**
- Create: `app/invite/[code]/page.tsx`

**Step 1: Create the invite page**

```typescript
import { auth } from '@/auth';
import { redirect, notFound } from 'next/navigation';
import { getEventByInviteCode, createEventAccess } from '@/lib/db/event-queries';

export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const event = await getEventByInviteCode(code);
  if (!event) notFound();

  const session = await auth();
  if (!session?.user) {
    redirect(`/login?callbackUrl=/invite/${code}`);
  }

  await createEventAccess(session.user.id, event.id);
  redirect(`/user/events/${event.id}`);
}
```

**Step 2: Verify build**

Run: `pnpm build`

**Step 3: Commit**

```bash
git add app/invite/[code]/page.tsx
git commit -m "feat: add invite link redirect page"
```

---

### Task 6: User Event Detail Page — Access Control

**Files:**
- Modify: `app/(user)/user/events/[id]/page.tsx`

**Step 1: Add access check for invite_only events**

Add `hasEventAccess` to the import from `@/lib/db/event-queries`.

After fetching the event (line 31-32), add the access check:

```typescript
  const event = await getEventById(id);
  if (!event || event.status === 'draft') notFound();

  // Access check for invite-only events
  if (event.type === 'invite_only') {
    const access = await hasEventAccess(session.user.id, id);
    if (!access) notFound();
  }
```

**Step 2: Verify build**

Run: `pnpm build`

**Step 3: Commit**

```bash
git add "app/(user)/user/events/[id]/page.tsx"
git commit -m "feat: add access control for invite-only events on detail page"
```

---

### Task 7: User Events Timeline — Filter Private Events

**Files:**
- Modify: `app/(user)/user/events/page.tsx`
- Modify: `lib/db/event-queries.ts`

**Step 1: Update `getUserEvents` to include accessed invite-only events**

In `event-queries.ts`, update `getUserEvents` to also return events where the user has event_access but no registration yet. Use a union approach or left join:

```typescript
export async function getUserEvents(userId: string, filter?: 'upcoming' | 'past') {
  const now = new Date();

  const conditions = [
    eq(eventRegistrations.userId, userId),
    ne(events.status, 'draft'),
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

  // Accessed invite-only events (where user has access but no registration)
  const accessConditions = [
    eq(eventAccess.userId, userId),
    eq(events.type, 'invite_only'),
    ne(events.status, 'draft'),
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

Note: This changes the return type — `registrationStatus` can now be `null` for accessed-but-not-registered events. Check downstream components (`EventTimeline`, `TimelineEventCard`) and update them to handle `null` registrationStatus.

**Step 2: Verify build**

Run: `pnpm build`

**Step 3: Commit**

```bash
git add lib/db/event-queries.ts "app/(user)/user/events/page.tsx"
git commit -m "feat: include accessed invite-only events in user timeline"
```

---

### Task 8: Install Switch Component + Update Event Form

**Files:**
- Create: `components/ui/switch.tsx` (via shadcn CLI)
- Modify: `components/admin/event-form.tsx`

**Step 1: Add shadcn Switch component**

Run: `pnpm dlx shadcn@latest add switch`

**Step 2: Update event form**

Add `invite_only` to the type selector, add "Require Approval" toggle, and include `requireApproval` in form submission.

Update the state type:
```typescript
const [eventType, setEventType] = useState<'waitlist' | 'lottery' | 'invite_only'>(
  event?.type || 'waitlist'
);
const [requireApproval, setRequireApproval] = useState(
  event?.requireApproval ?? false
);
```

Add imports:
```typescript
import { Switch } from '@/components/ui/switch';
import { ShieldCheck } from 'lucide-react';
```

Update `handleSubmit` to include `requireApproval`:
```typescript
formData.set('requireApproval', String(requireApproval));
```

In the Event Options section, add `invite_only` to SelectContent:
```tsx
<SelectItem value="invite_only">Invite Only</SelectItem>
```

Add Require Approval toggle row (after the Status row, inside the `rounded-xl border divide-y` div):
```tsx
{/* Require Approval */}
<div className="flex items-center justify-between px-3 sm:px-4 py-2">
  <div className="flex items-center gap-2.5">
    <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
    <span className="text-sm">Require Approval</span>
  </div>
  <Switch
    checked={requireApproval}
    onCheckedChange={setRequireApproval}
  />
</div>
```

Hide lottery deadline when type is `invite_only` (update conditional from `eventType === 'lottery'` to same).

**Step 3: Verify build**

Run: `pnpm build`

**Step 4: Commit**

```bash
git add components/ui/switch.tsx components/admin/event-form.tsx
git commit -m "feat: add invite_only type and require approval toggle to event form"
```

---

### Task 9: Registration Button — New States

**Files:**
- Modify: `components/user/event-registration-button.tsx`

**Step 1: Update the registration button component**

Add `pending_approval` to status labels and handle the new states:

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
        } else if (event.type === 'lottery') {
          toast.success('Entered lottery!');
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
      lottery_entered: "Lottery Entry Submitted",
      selected: "You've Been Selected",
      rejected: 'Not Selected',
      checked_in: 'Checked In',
      no_show: 'Marked as No-Show',
      pending_approval: 'Pending Approval',
    };

    const canCancel = ['registered', 'waitlisted', 'lottery_entered', 'pending_approval'].includes(registration.status);

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

  // Require approval — show "Request Access" for all types
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

  // invite_only without approval — FCFS
  if (event.type === 'invite_only') {
    if (spotsRemaining <= 0) {
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
        {isPending ? 'Registering...' : 'RSVP'}
      </Button>
    );
  }

  // Lottery type
  if (event.type === 'lottery') {
    const deadlinePassed = event.lotteryDeadline && new Date() > event.lotteryDeadline;
    return (
      <Button
        size="lg"
        className="w-full rounded-xl text-lg"
        disabled={isPending || !!deadlinePassed}
        onClick={handleRegister}
      >
        {deadlinePassed ? 'Lottery Closed' : isPending ? 'Entering...' : 'Enter Lottery'}
      </Button>
    );
  }

  // Waitlist type
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

**Step 2: Verify build**

Run: `pnpm build`

**Step 3: Commit**

```bash
git add components/user/event-registration-button.tsx
git commit -m "feat: add pending_approval and invite_only states to registration button"
```

---

### Task 10: Registrations Table — Approval Actions

**Files:**
- Modify: `components/admin/registrations-table.tsx`

**Step 1: Add approval buttons and sort pending to top**

Add `pending_approval` to status colors. Import and use the new `approveRegistration` and `denyRegistration` actions. Sort registrations so `pending_approval` appear first.

```typescript
'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { removeRegistration, approveRegistration, denyRegistration } from '@/app/actions/events';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Trash2, Check, X } from 'lucide-react';

interface Registration {
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
}

const statusColors: Record<string, string> = {
  registered: 'bg-green-500/10 text-green-500 border-green-500/20',
  waitlisted: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  lottery_entered: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  selected: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  rejected: 'bg-red-500/10 text-red-500 border-red-500/20',
  checked_in: 'bg-green-500/10 text-green-700 border-green-500/20',
  no_show: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
  pending_approval: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
};

export function RegistrationsTable({
  registrations,
  eventId,
  showPriority,
}: {
  registrations: Registration[];
  eventId: string;
  showPriority?: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  const handleRemove = (registrationId: string) => {
    startTransition(async () => {
      try {
        await removeRegistration(registrationId, eventId);
        toast.success('Registration removed');
      } catch {
        toast.error('Failed to remove registration');
      }
    });
  };

  const handleApprove = (registrationId: string) => {
    startTransition(async () => {
      try {
        await approveRegistration(registrationId, eventId);
        toast.success('Registration approved');
      } catch {
        toast.error('Failed to approve registration');
      }
    });
  };

  const handleDeny = (registrationId: string) => {
    startTransition(async () => {
      try {
        await denyRegistration(registrationId, eventId);
        toast.success('Registration denied');
      } catch {
        toast.error('Failed to deny registration');
      }
    });
  };

  if (registrations.length === 0) {
    return <p className="py-8 text-center text-muted-foreground">No registrations yet.</p>;
  }

  // Sort: pending_approval first, then by createdAt
  const sorted = [...registrations].sort((a, b) => {
    if (a.registration.status === 'pending_approval' && b.registration.status !== 'pending_approval') return -1;
    if (a.registration.status !== 'pending_approval' && b.registration.status === 'pending_approval') return 1;
    return new Date(a.registration.createdAt).getTime() - new Date(b.registration.createdAt).getTime();
  });

  return (
    <div className="space-y-1">
      {sorted.map(({ registration, user }) => (
        <div key={registration.id} className="flex items-center justify-between rounded-lg border p-3">
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
          </div>
          <div className="flex items-center gap-2 ml-2">
            {showPriority && registration.lotteryPriorityScore != null && (
              <span className="text-xs text-muted-foreground">
                Score: {registration.lotteryPriorityScore.toFixed(1)}
              </span>
            )}
            <Badge variant="outline" className={statusColors[registration.status] || ''}>
              {registration.status.replace('_', ' ')}
            </Badge>
            {registration.status === 'pending_approval' ? (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50"
                  onClick={() => handleApprove(registration.id)}
                  disabled={isPending}
                  title="Approve"
                >
                  <Check className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={() => handleDeny(registration.id)}
                  disabled={isPending}
                  title="Deny"
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
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
```

**Step 2: Verify build**

Run: `pnpm build`

**Step 3: Commit**

```bash
git add components/admin/registrations-table.tsx
git commit -m "feat: add approval/deny actions and pending_approval badge to registrations table"
```

---

### Task 11: Admin Event Detail — Invite Link Card

**Files:**
- Modify: `app/(admin)/admin/events/[id]/page.tsx`

**Step 1: Add invite link section for invite_only events**

Add a card above the tabs that shows the invite link with copy and regenerate buttons. This needs to be a client component extract for the copy/regenerate interactions.

Create a small client component `components/admin/invite-link-card.tsx`:

```typescript
'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Copy, RefreshCw, Check, Link } from 'lucide-react';
import { regenerateInviteCode } from '@/app/actions/events';
import { toast } from 'sonner';

export function InviteLinkCard({ eventId, inviteCode }: { eventId: string; inviteCode: string }) {
  const [code, setCode] = useState(inviteCode);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  const inviteUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/invite/${code}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    toast.success('Invite link copied');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRegenerate = () => {
    startTransition(async () => {
      try {
        const newCode = await regenerateInviteCode(eventId);
        setCode(newCode);
        toast.success('Invite link regenerated');
      } catch {
        toast.error('Failed to regenerate invite link');
      }
    });
  };

  return (
    <Card className="mb-6">
      <CardContent className="flex items-center gap-3 py-3">
        <Link className="h-4 w-4 text-muted-foreground shrink-0" />
        <code className="flex-1 text-sm truncate text-muted-foreground">{inviteUrl}</code>
        <Button variant="outline" size="sm" onClick={handleCopy}>
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
        <Button variant="outline" size="sm" onClick={handleRegenerate} disabled={isPending}>
          <RefreshCw className={`h-3.5 w-3.5 ${isPending ? 'animate-spin' : ''}`} />
        </Button>
      </CardContent>
    </Card>
  );
}
```

**Step 2: Use it in admin event detail page**

Import and render `InviteLinkCard` in `app/(admin)/admin/events/[id]/page.tsx`, above the Tabs:

```tsx
import { InviteLinkCard } from '@/components/admin/invite-link-card';
```

Add before the `<Tabs>` element:
```tsx
{event.type === 'invite_only' && event.inviteCode && (
  <InviteLinkCard eventId={id} inviteCode={event.inviteCode} />
)}
```

**Step 3: Verify build**

Run: `pnpm build`

**Step 4: Commit**

```bash
git add components/admin/invite-link-card.tsx "app/(admin)/admin/events/[id]/page.tsx"
git commit -m "feat: add invite link card to admin event detail page"
```

---

### Task 12: Handle Downstream Type Changes

**Files:**
- Check and update: `components/user/event-timeline.tsx`, `components/user/timeline-event-card.tsx`

**Step 1: Verify timeline components handle nullable registrationStatus**

Since `getUserEvents` now returns `registrationStatus: string | null` (for accessed invite-only events with no registration), check these components and update any code that assumes `registrationStatus` is always a string.

Look for any `.includes()` or direct comparisons on `registrationStatus` and add null checks where needed.

Also add `pending_approval` to any status display logic and `invite_only` to any type display logic in these components.

**Step 2: Verify build**

Run: `pnpm build`

**Step 3: Commit**

```bash
git add components/user/event-timeline.tsx components/user/timeline-event-card.tsx
git commit -m "feat: handle nullable registrationStatus and new types in timeline components"
```

---

### Task 13: Final Build Verification & Smoke Test

**Step 1: Full build**

Run: `pnpm build`
Expected: Successful build, no type errors.

**Step 2: Manual smoke test checklist**

Start dev server: `pnpm dev`

Test these flows:
1. Create an invite_only event with require approval ON → verify invite code is generated
2. Copy invite link → open in browser → verify redirect to event detail
3. As a user, request access → verify pending_approval status shown
4. As admin, approve the request → verify user becomes registered
5. Create a public waitlist event with require approval ON → verify "Request Access" button shows
6. Verify private events don't appear in public listings
7. Verify private events DO appear in the user's timeline after accessing invite link

**Step 3: Final commit (if any fixes)**

```bash
git add -A
git commit -m "fix: address issues found during smoke testing"
```
