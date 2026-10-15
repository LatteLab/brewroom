# Events MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an event management system with waitlist/lottery registration, member directory, check-in mode, and Luma-inspired UI.

**Architecture:** Server components for pages, server actions for mutations, Drizzle ORM queries. No API routes. Extends existing NextAuth users table, adds events/registrations/lottery tables.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Tailwind CSS v4, shadcn/ui, Drizzle ORM, PostgreSQL (Supabase), Zod validation.

**Design reference:** See `docs/plans/2026-02-16-events-mvp-design.md` for full design spec.

---

### Task 1: Add shadcn/ui components needed for the MVP

We need several shadcn/ui components that aren't installed yet: Tabs, Textarea, RadioGroup, and Checkbox.

**Files:**
- Create: `components/ui/tabs.tsx`
- Create: `components/ui/textarea.tsx`
- Create: `components/ui/radio-group.tsx`
- Create: `components/ui/checkbox.tsx`

**Step 1: Install the components**

Run:
```bash
pnpm dlx shadcn@latest add tabs textarea radio-group checkbox
```

**Step 2: Verify the components exist**

Run:
```bash
ls components/ui/tabs.tsx components/ui/textarea.tsx components/ui/radio-group.tsx components/ui/checkbox.tsx
```

**Step 3: Commit**

```bash
git add components/ui/tabs.tsx components/ui/textarea.tsx components/ui/radio-group.tsx components/ui/checkbox.tsx
git commit -m "feat: add shadcn tabs, textarea, radio-group, checkbox components"
```

---

### Task 2: Extend database schema with member profile fields and event tables

Add member profile columns to the existing `users` table and create the `events`, `eventRegistrations`, and `lotteryHistory` tables.

**Files:**
- Modify: `lib/db/schema.ts`

**Step 1: Add pgEnum imports and define enums**

At the top of `lib/db/schema.ts`, update the import to include `pgEnum`, `real`, `uniqueIndex`:

```typescript
import { pgTable, pgEnum, text, timestamp, uuid, primaryKey, integer, real, unique } from 'drizzle-orm/pg-core';
```

Add enums after the import block:

```typescript
export const eventTypeEnum = pgEnum('event_type', ['waitlist', 'lottery']);
export const eventStatusEnum = pgEnum('event_status', ['draft', 'open', 'closed', 'completed']);
export const registrationStatusEnum = pgEnum('registration_status', [
  'registered', 'waitlisted', 'lottery_entered', 'selected', 'rejected', 'checked_in', 'no_show'
]);
export const lotteryOutcomeEnum = pgEnum('lottery_outcome', ['won', 'lost']);
```

**Step 2: Add member profile columns to `users` table**

Add these columns to the existing `users` pgTable definition, after the existing columns:

```typescript
  major: text('major'),
  classYear: text('class_year'),
  phone: text('phone'),
  interests: text('interests'),
  semesterStatus: text('semester_status'),
  bio: text('bio'),
  location: text('location'),
```

**Step 3: Add `events` table**

After the `adminWhitelist` table:

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
  type: eventTypeEnum('type').notNull(),
  lotteryDeadline: timestamp('lottery_deadline', { mode: 'date' }),
  status: eventStatusEnum('status').notNull().default('draft'),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

**Step 4: Add `eventRegistrations` table**

```typescript
export const eventRegistrations = pgTable('event_registrations', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  status: registrationStatusEnum('status').notNull(),
  lotteryPriorityScore: real('lottery_priority_score'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  userEventUnique: unique().on(table.userId, table.eventId),
}));
```

**Step 5: Add `lotteryHistory` table**

```typescript
export const lotteryHistory = pgTable('lottery_history', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  outcome: lotteryOutcomeEnum('outcome').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

**Step 6: Add type exports**

Add to the Type Exports section:

```typescript
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type EventRegistration = typeof eventRegistrations.$inferSelect;
export type NewEventRegistration = typeof eventRegistrations.$inferInsert;
export type LotteryHistory = typeof lotteryHistory.$inferSelect;
```

**Step 7: Push schema to database**

Run:
```bash
pnpm db:push
```

Expected: Schema changes applied successfully (new enums, new columns on users, new tables).

**Step 8: Commit**

```bash
git add lib/db/schema.ts
git commit -m "feat: add events schema — events, registrations, lottery tables + user profile fields"
```

---

### Task 3: Add event database queries

Create query functions for events, registrations, lottery, and member profiles.

**Files:**
- Create: `lib/db/event-queries.ts`

**Step 1: Create `lib/db/event-queries.ts`**

```typescript
import { db } from './index';
import { events, eventRegistrations, lotteryHistory, users } from './schema';
import { eq, and, desc, gte, sql, count, avg, inArray } from 'drizzle-orm';
import type { Event, NewEvent, EventRegistration } from './schema';

// ============================================================================
// Event Queries
// ============================================================================

export async function getEvents(filter?: 'upcoming' | 'past') {
  const now = new Date();
  const query = db.select().from(events);

  if (filter === 'upcoming') {
    return query.where(gte(events.date, now)).orderBy(events.date);
  }
  if (filter === 'past') {
    return query.where(sql`${events.date} < ${now}`).orderBy(desc(events.date));
  }
  return query.orderBy(desc(events.date));
}

export async function getPublishedEvents(filter?: 'upcoming' | 'past') {
  const now = new Date();
  if (filter === 'upcoming') {
    return db.select().from(events)
      .where(and(
        sql`${events.status} != 'draft'`,
        gte(events.date, now)
      ))
      .orderBy(events.date);
  }
  if (filter === 'past') {
    return db.select().from(events)
      .where(and(
        sql`${events.status} != 'draft'`,
        sql`${events.date} < ${now}`
      ))
      .orderBy(desc(events.date));
  }
  return db.select().from(events)
    .where(sql`${events.status} != 'draft'`)
    .orderBy(desc(events.date));
}

export async function getEventById(id: string): Promise<Event | null> {
  const [event] = await db.select().from(events).where(eq(events.id, id)).limit(1);
  return event || null;
}

export async function createEvent(data: NewEvent): Promise<Event> {
  const [event] = await db.insert(events).values(data).returning();
  return event;
}

export async function updateEvent(id: string, data: Partial<NewEvent>): Promise<Event> {
  const [event] = await db.update(events)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(events.id, id))
    .returning();
  return event;
}

// ============================================================================
// Registration Queries
// ============================================================================

export async function getEventRegistrations(eventId: string) {
  return db.select({
    registration: eventRegistrations,
    user: {
      id: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
    },
  })
    .from(eventRegistrations)
    .innerJoin(users, eq(eventRegistrations.userId, users.id))
    .where(eq(eventRegistrations.eventId, eventId))
    .orderBy(eventRegistrations.createdAt);
}

export async function getRegistrationCount(eventId: string, statuses?: string[]) {
  const conditions = [eq(eventRegistrations.eventId, eventId)];
  if (statuses && statuses.length > 0) {
    conditions.push(
      inArray(eventRegistrations.status, statuses as EventRegistration['status'][])
    );
  }
  const [result] = await db.select({ count: count() })
    .from(eventRegistrations)
    .where(and(...conditions));
  return result?.count ?? 0;
}

export async function getUserRegistration(userId: string, eventId: string) {
  const [reg] = await db.select()
    .from(eventRegistrations)
    .where(and(
      eq(eventRegistrations.userId, userId),
      eq(eventRegistrations.eventId, eventId)
    ))
    .limit(1);
  return reg || null;
}

export async function createRegistration(data: { userId: string; eventId: string; status: EventRegistration['status'] }) {
  const [reg] = await db.insert(eventRegistrations)
    .values(data)
    .returning();
  return reg;
}

export async function updateRegistration(id: string, data: Partial<EventRegistration>) {
  const [reg] = await db.update(eventRegistrations)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(eventRegistrations.id, id))
    .returning();
  return reg;
}

export async function deleteRegistration(userId: string, eventId: string) {
  await db.delete(eventRegistrations)
    .where(and(
      eq(eventRegistrations.userId, userId),
      eq(eventRegistrations.eventId, eventId)
    ));
}

// ============================================================================
// Lottery Queries
// ============================================================================

export async function getLotteryHistory(userId: string) {
  return db.select().from(lotteryHistory)
    .where(eq(lotteryHistory.userId, userId))
    .orderBy(desc(lotteryHistory.createdAt));
}

export async function getUserNoShowCount(userId: string): Promise<number> {
  const [result] = await db.select({ count: count() })
    .from(eventRegistrations)
    .where(and(
      eq(eventRegistrations.userId, userId),
      eq(eventRegistrations.status, 'no_show')
    ));
  return result?.count ?? 0;
}

export async function getUserLotteryStats(userId: string) {
  const history = await db.select({
    outcome: lotteryHistory.outcome,
    count: count(),
  })
    .from(lotteryHistory)
    .where(eq(lotteryHistory.userId, userId))
    .groupBy(lotteryHistory.outcome);

  const wins = history.find(h => h.outcome === 'won')?.count ?? 0;
  const losses = history.find(h => h.outcome === 'lost')?.count ?? 0;
  return { wins, losses };
}

export async function computePriorityScore(userId: string): Promise<number> {
  const [stats, noShowCount] = await Promise.all([
    getUserLotteryStats(userId),
    getUserNoShowCount(userId),
  ]);
  return 1.0 + (stats.losses * 0.5) - (noShowCount * 1.0);
}

export async function createLotteryHistoryEntries(entries: { userId: string; eventId: string; outcome: 'won' | 'lost' }[]) {
  if (entries.length === 0) return;
  await db.insert(lotteryHistory).values(entries);
}

// ============================================================================
// Check-in Queries
// ============================================================================

export async function getCheckinAttendees(eventId: string) {
  return db.select({
    registration: eventRegistrations,
    user: {
      id: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
    },
  })
    .from(eventRegistrations)
    .innerJoin(users, eq(eventRegistrations.userId, users.id))
    .where(and(
      eq(eventRegistrations.eventId, eventId),
      inArray(eventRegistrations.status, ['registered', 'selected', 'checked_in'])
    ))
    .orderBy(users.name);
}

export async function bulkMarkNoShow(eventId: string) {
  await db.update(eventRegistrations)
    .set({ status: 'no_show', updatedAt: new Date() })
    .where(and(
      eq(eventRegistrations.eventId, eventId),
      inArray(eventRegistrations.status, ['registered', 'selected'])
    ));
}

// ============================================================================
// Member Profile Queries
// ============================================================================

export async function updateUserProfile(userId: string, data: {
  major?: string | null;
  classYear?: string | null;
  phone?: string | null;
  interests?: string | null;
  bio?: string | null;
  location?: string | null;
  semesterStatus?: string | null;
}) {
  const [user] = await db.update(users)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  return user;
}

export async function getAllMembers() {
  return db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    image: users.image,
    major: users.major,
    classYear: users.classYear,
    phone: users.phone,
    interests: users.interests,
    bio: users.bio,
    location: users.location,
    semesterStatus: users.semesterStatus,
  })
    .from(users)
    .orderBy(users.name);
}

// ============================================================================
// Analytics Queries
// ============================================================================

export async function getEventStats() {
  const allEvents = await db.select().from(events)
    .where(eq(events.status, 'completed'));

  const totalEvents = allEvents.length;

  if (totalEvents === 0) {
    return { totalEvents: 0, avgAttendanceRate: 0, noShowRate: 0 };
  }

  const eventIds = allEvents.map(e => e.id);
  const allRegs = await db.select({
    status: eventRegistrations.status,
    count: count(),
  })
    .from(eventRegistrations)
    .where(inArray(eventRegistrations.eventId, eventIds))
    .groupBy(eventRegistrations.status);

  const checkedIn = allRegs.find(r => r.status === 'checked_in')?.count ?? 0;
  const noShows = allRegs.find(r => r.status === 'no_show')?.count ?? 0;
  const total = checkedIn + noShows;

  return {
    totalEvents,
    avgAttendanceRate: total > 0 ? Math.round((checkedIn / total) * 100) : 0,
    noShowRate: total > 0 ? Math.round((noShows / total) * 100) : 0,
  };
}

export async function getUserEventHistory(userId: string) {
  return db.select({
    registration: eventRegistrations,
    event: {
      id: events.id,
      name: events.name,
      date: events.date,
    },
  })
    .from(eventRegistrations)
    .innerJoin(events, eq(eventRegistrations.eventId, events.id))
    .where(eq(eventRegistrations.userId, userId))
    .orderBy(desc(events.date));
}
```

**Step 2: Export from `lib/db/index.ts`**

Add to `lib/db/index.ts`:

```typescript
export * from './event-queries';
```

**Step 3: Verify build**

Run:
```bash
pnpm build
```

Expected: Build succeeds.

**Step 4: Commit**

```bash
git add lib/db/event-queries.ts lib/db/index.ts
git commit -m "feat: add event, registration, lottery, and member query functions"
```

---

### Task 4: Add Zod validation schemas

Create validation schemas for event creation, profile updates, and registration actions.

**Files:**
- Create: `lib/validations/events.ts`
- Create: `lib/validations/profile.ts`

**Step 1: Create `lib/validations/events.ts`**

```typescript
import { z } from 'zod';

export const createEventSchema = z.object({
  name: z.string().min(1, 'Event name is required').max(255),
  description: z.string().optional(),
  coverImage: z.string().url().optional().or(z.literal('')),
  date: z.coerce.date({ required_error: 'Event date is required' }),
  endDate: z.coerce.date().optional(),
  location: z.string().optional(),
  capacity: z.coerce.number().int().min(1, 'Capacity must be at least 1'),
  type: z.enum(['waitlist', 'lottery']),
  lotteryDeadline: z.coerce.date().optional(),
  status: z.enum(['draft', 'open']).default('draft'),
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

**Step 2: Create `lib/validations/profile.ts`**

```typescript
import { z } from 'zod';

export const updateProfileSchema = z.object({
  major: z.string().max(100).optional().or(z.literal('')),
  classYear: z.string().max(10).optional().or(z.literal('')),
  phone: z.string().max(20).optional().or(z.literal('')),
  interests: z.string().optional().or(z.literal('')),
  bio: z.string().optional().or(z.literal('')),
  location: z.string().max(100).optional().or(z.literal('')),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
```

**Step 3: Commit**

```bash
git add lib/validations/
git commit -m "feat: add Zod validation schemas for events and profiles"
```

---

### Task 5: Add server actions for events, registration, lottery, check-in, and profiles

**Files:**
- Create: `app/actions/events.ts`
- Create: `app/actions/profile.ts`

**Step 1: Create `app/actions/events.ts`**

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
} from '@/lib/db/event-queries';
import { createEventSchema, updateEventSchema } from '@/lib/validations/events';

export async function createEventAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const raw = Object.fromEntries(formData);
  const parsed = createEventSchema.parse({
    ...raw,
    capacity: Number(raw.capacity),
  });

  const event = await dbCreateEvent({
    ...parsed,
    coverImage: parsed.coverImage || null,
    description: parsed.description || null,
    location: parsed.location || null,
    endDate: parsed.endDate || null,
    lotteryDeadline: parsed.lotteryDeadline || null,
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

export async function registerForEvent(eventId: string) {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');

  const event = await getEventById(eventId);
  if (!event || event.status === 'draft' || event.status === 'completed') {
    throw new Error('Event not available for registration');
  }

  const existing = await getUserRegistration(session.user.id, eventId);
  if (existing) throw new Error('Already registered');

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
    // Waitlist type
    const confirmedCount = await getRegistrationCount(eventId, ['registered', 'checked_in']);
    const status = confirmedCount < event.capacity ? 'registered' : 'waitlisted';
    await createRegistration({
      userId: session.user.id,
      eventId,
      status,
    });
  }

  revalidatePath(`/user/events/${eventId}`);
  revalidatePath(`/admin/events/${eventId}`);
}

export async function cancelRegistration(eventId: string) {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');

  await deleteRegistration(session.user.id, eventId);

  // If waitlist event, promote next person
  const event = await getEventById(eventId);
  if (event?.type === 'waitlist') {
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
  if (!event || event.type !== 'lottery') throw new Error('Not a lottery event');

  const regs = await getEventRegistrations(eventId);
  const entrants = regs.filter(r => r.registration.status === 'lottery_entered');

  if (entrants.length === 0) throw new Error('No lottery entrants');

  // Compute priority scores
  const scored = await Promise.all(
    entrants.map(async (entry) => {
      const score = await computePriorityScore(entry.user.id);
      return { ...entry, score: Math.max(score, 0.1) }; // Floor at 0.1
    })
  );

  // Weighted random selection
  const spots = event.capacity;
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

  // Close lottery
  await dbUpdateEvent(eventId, { status: 'closed' });

  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath(`/user/events/${eventId}`);

  return {
    selected: selected.map(s => ({ name: s.user.name, email: s.user.email, score: s.score })),
    rejected: pool.map(s => ({ name: s.user.name, email: s.user.email, score: s.score })),
  };
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

  // Get the registration first
  const regs = await getEventRegistrations(eventId);
  const reg = regs.find(r => r.registration.id === registrationId);
  if (!reg) throw new Error('Registration not found');

  await deleteRegistration(reg.user.id, eventId);
  revalidatePath(`/admin/events/${eventId}`);
}
```

**Step 2: Create `app/actions/profile.ts`**

```typescript
'use server';

import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';
import { updateUserProfile } from '@/lib/db/event-queries';
import { updateProfileSchema } from '@/lib/validations/profile';

export async function updateProfile(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');

  const raw = Object.fromEntries(formData);
  const parsed = updateProfileSchema.parse(raw);

  // Convert empty strings to null for database
  const data = Object.fromEntries(
    Object.entries(parsed).map(([key, value]) => [key, value === '' ? null : value])
  ) as Record<string, string | null>;

  await updateUserProfile(session.user.id, data);

  revalidatePath('/user/profile');
  revalidatePath('/user/directory');
}
```

**Step 3: Verify build**

Run:
```bash
pnpm build
```

**Step 4: Commit**

```bash
git add app/actions/events.ts app/actions/profile.ts
git commit -m "feat: add server actions for events, registration, lottery, check-in, profiles"
```

---

### Task 6: Create member portal layout with sidebar navigation

Replace the bare user page with a sidebar layout matching the admin section pattern.

**Files:**
- Create: `components/user/user-sidebar.tsx`
- Create: `app/(user)/user/layout.tsx`
- Modify: `app/(user)/user/page.tsx`

**Step 1: Create `components/user/user-sidebar.tsx`**

```typescript
'use client';

import { Calendar, Users, User, LayoutDashboard, LogOut, Shield } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';

const navItems = [
  { title: 'Events', url: '/user/events', icon: Calendar },
  { title: 'Directory', url: '/user/directory', icon: Users },
  { title: 'Profile', url: '/user/profile', icon: User },
];

export function UserSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/user/events">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <LayoutDashboard className="size-4" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold">Latte Lab</span>
                  <span className="text-xs">Member Portal</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={pathname.startsWith(item.url)}>
                    <Link href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {session?.user?.isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <Link href="/admin">
                      <Shield />
                      <span>Admin Panel</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <button onClick={() => signOut({ callbackUrl: '/login' })} className="w-full">
                <LogOut />
                <span>Sign Out</span>
              </button>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
```

**Step 2: Create `app/(user)/user/layout.tsx`**

```typescript
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { SidebarProvider } from '@/components/ui/sidebar';
import { UserSidebar } from '@/components/user/user-sidebar';

export default async function UserLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  return (
    <SidebarProvider>
      <UserSidebar />
      <main className="flex flex-1 flex-col overflow-hidden">
        {children}
      </main>
    </SidebarProvider>
  );
}
```

**Step 3: Update `app/(user)/user/page.tsx` to redirect to events**

Replace the entire file:

```typescript
import { redirect } from 'next/navigation';

export default function UserPage() {
  redirect('/user/events');
}
```

**Step 4: Verify dev server**

Run:
```bash
pnpm dev
```

Navigate to `/user` — should redirect to `/user/events` (which won't exist yet, 404 is expected).

**Step 5: Commit**

```bash
git add components/user/user-sidebar.tsx app/(user)/user/layout.tsx app/(user)/user/page.tsx
git commit -m "feat: add member portal sidebar layout with navigation"
```

---

### Task 7: Add admin sidebar "Events" link

**Files:**
- Modify: `components/admin/admin-sidebar.tsx`

**Step 1: Add Calendar import and Events nav item**

In `components/admin/admin-sidebar.tsx`, add `Calendar` to the lucide-react import, and add the Events item to the `navItems` array between Dashboard and Users:

```typescript
{
  title: "Events",
  url: "/admin/events",
  icon: Calendar,
},
```

**Step 2: Update active state logic**

Change `isActive={pathname === item.url}` to `isActive={pathname === item.url || pathname.startsWith(item.url + '/')}` so sub-pages highlight correctly.

**Step 3: Commit**

```bash
git add components/admin/admin-sidebar.tsx
git commit -m "feat: add Events link to admin sidebar"
```

---

### Task 8: Build member event catalog page

**Files:**
- Create: `app/(user)/user/events/page.tsx`
- Create: `components/user/event-card.tsx`

**Step 1: Create `components/user/event-card.tsx`**

```typescript
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar, MapPin } from 'lucide-react';
import type { Event } from '@/lib/db/schema';

function getEventBadge(event: Event, registeredCount: number) {
  if (event.type === 'lottery') {
    if (event.lotteryDeadline && new Date() > event.lotteryDeadline) {
      return { label: 'Lottery Closed', className: 'bg-gray-500/10 text-gray-500 border-gray-500/20' };
    }
    return { label: 'Lottery Open', className: 'bg-purple-500/10 text-purple-500 border-purple-500/20' };
  }
  // Waitlist type
  if (registeredCount < event.capacity) {
    return { label: 'Open', className: 'bg-green-500/10 text-green-500 border-green-500/20' };
  }
  return { label: 'Waitlist', className: 'bg-amber-500/10 text-amber-500 border-amber-500/20' };
}

function formatEventDate(date: Date) {
  return new Date(date).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).toUpperCase();
}

interface EventCardProps {
  event: Event;
  registeredCount: number;
}

export function EventCard({ event, registeredCount }: EventCardProps) {
  const badge = getEventBadge(event, registeredCount);

  return (
    <Link href={`/user/events/${event.id}`}>
      <Card className="group overflow-hidden rounded-2xl border-0 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.08)] transition-all hover:shadow-[0_8px_32px_-4px_rgba(0,0,0,0.12)] dark:shadow-[0_4px_24px_-4px_rgba(0,0,0,0.3)] dark:hover:shadow-[0_8px_32px_-4px_rgba(0,0,0,0.4)]">
        {/* Cover image */}
        <div className="aspect-[16/9] overflow-hidden bg-muted">
          {event.coverImage ? (
            <img
              src={event.coverImage}
              alt={event.name}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
              <Calendar className="h-12 w-12 text-primary/40" />
            </div>
          )}
        </div>

        <CardContent className="space-y-2 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-primary">
              {formatEventDate(event.date)}
            </p>
            <Badge variant="outline" className={badge.className}>
              {badge.label}
            </Badge>
          </div>
          <h3 className="text-lg font-semibold tracking-tight line-clamp-1">
            {event.name}
          </h3>
          {event.location && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              <span className="line-clamp-1">{event.location}</span>
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            {registeredCount} / {event.capacity} spots
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
```

**Step 2: Create `app/(user)/user/events/page.tsx`**

```typescript
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { getPublishedEvents, getRegistrationCount } from '@/lib/db/event-queries';
import { PageHeader } from '@/components/ui/page-header';
import { EventCard } from '@/components/user/event-card';
import { Calendar } from 'lucide-react';

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const params = await searchParams;
  const filter = params.filter as 'upcoming' | 'past' | undefined;
  const events = await getPublishedEvents(filter || 'upcoming');

  // Get registration counts for each event
  const eventsWithCounts = await Promise.all(
    events.map(async (event) => {
      const count = await getRegistrationCount(event.id, ['registered', 'selected', 'checked_in']);
      return { event, registeredCount: count };
    })
  );

  return (
    <>
      <PageHeader title="Events" showSidebarTrigger />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-4 py-6">
          {/* Filter tabs */}
          <div className="mb-6 flex gap-2">
            <a
              href="/user/events?filter=upcoming"
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                filter !== 'past'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              Upcoming
            </a>
            <a
              href="/user/events?filter=past"
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                filter === 'past'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              Past
            </a>
          </div>

          {eventsWithCounts.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {eventsWithCounts.map(({ event, registeredCount }) => (
                <EventCard key={event.id} event={event} registeredCount={registeredCount} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Calendar className="h-16 w-16 text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-semibold">No events yet</h3>
              <p className="text-muted-foreground mt-1">
                {filter === 'past' ? 'No past events to show.' : 'Check back soon for upcoming events.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
```

**Step 3: Verify build**

Run: `pnpm build`

**Step 4: Commit**

```bash
git add components/user/event-card.tsx app/(user)/user/events/page.tsx
git commit -m "feat: add member event catalog page with Luma-style cards"
```

---

### Task 9: Build member event detail page with registration

**Files:**
- Create: `app/(user)/user/events/[id]/page.tsx`
- Create: `components/user/event-registration-button.tsx`

**Step 1: Create `components/user/event-registration-button.tsx`**

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
        toast.success(
          event.type === 'lottery' ? 'Entered lottery!' :
          spotsRemaining > 0 ? "You're registered!" : 'Added to waitlist!'
        );
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

  // Already registered
  if (registration) {
    const statusLabels: Record<string, string> = {
      registered: "You're In",
      waitlisted: "You're on the Waitlist",
      lottery_entered: "Lottery Entry Submitted",
      selected: "You've Been Selected",
      rejected: 'Not Selected',
      checked_in: 'Checked In',
      no_show: 'Marked as No-Show',
    };

    const canCancel = ['registered', 'waitlisted', 'lottery_entered'].includes(registration.status);

    return (
      <div className="space-y-2">
        <Button
          size="lg"
          className="w-full rounded-xl text-lg"
          variant={registration.status === 'rejected' || registration.status === 'no_show' ? 'destructive' : 'default'}
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
            Cancel Registration
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

**Step 2: Create `app/(user)/user/events/[id]/page.tsx`**

```typescript
import { auth } from '@/auth';
import { redirect, notFound } from 'next/navigation';
import { getEventById, getUserRegistration, getEventRegistrations, getRegistrationCount } from '@/lib/db/event-queries';
import { PageHeader } from '@/components/ui/page-header';
import { EventRegistrationButton } from '@/components/user/event-registration-button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Calendar, MapPin, Users, Clock } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(date: Date) {
  return new Date(date).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const { id } = await params;
  const event = await getEventById(id);
  if (!event || event.status === 'draft') notFound();

  const [registration, registrations, confirmedCount] = await Promise.all([
    getUserRegistration(session.user.id, id),
    getEventRegistrations(id),
    getRegistrationCount(id, ['registered', 'selected', 'checked_in']),
  ]);

  const spotsRemaining = Math.max(0, event.capacity - confirmedCount);
  const capacityPercent = Math.min(100, Math.round((confirmedCount / event.capacity) * 100));

  // Get confirmed attendees for guest list
  const attendees = registrations.filter(r =>
    ['registered', 'selected', 'checked_in'].includes(r.registration.status)
  );

  return (
    <>
      <PageHeader title={event.name} showSidebarTrigger />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-4 py-8">
          <div className="grid gap-8 md:grid-cols-[1fr_1.2fr]">
            {/* Left: Cover image */}
            <div>
              <div className="aspect-square overflow-hidden rounded-2xl bg-muted">
                {event.coverImage ? (
                  <img
                    src={event.coverImage}
                    alt={event.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
                    <Calendar className="h-20 w-20 text-primary/30" />
                  </div>
                )}
              </div>
            </div>

            {/* Right: Event info */}
            <div className="space-y-6">
              <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
                {event.name}
              </h1>

              <div className="space-y-3">
                <div className="flex items-center gap-3 text-muted-foreground">
                  <Calendar className="h-5 w-5 shrink-0" />
                  <div>
                    <p className="font-medium text-foreground">{formatDate(event.date)}</p>
                    <p className="text-sm">
                      {formatTime(event.date)}
                      {event.endDate && ` — ${formatTime(event.endDate)}`}
                    </p>
                  </div>
                </div>

                {event.location && (
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <MapPin className="h-5 w-5 shrink-0" />
                    <p className="font-medium text-foreground">{event.location}</p>
                  </div>
                )}

                <div className="flex items-center gap-3 text-muted-foreground">
                  <Users className="h-5 w-5 shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium text-foreground">
                      {confirmedCount} / {event.capacity} spots
                    </p>
                    <Progress value={capacityPercent} className="mt-1 h-2" />
                  </div>
                </div>

                {event.type === 'lottery' && event.lotteryDeadline && (
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <Clock className="h-5 w-5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-foreground">Lottery Deadline</p>
                      <p className="text-sm">{formatDate(event.lotteryDeadline)} at {formatTime(event.lotteryDeadline)}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Registration button */}
              <EventRegistrationButton
                event={event}
                registration={registration}
                spotsRemaining={spotsRemaining}
              />

              {/* Description */}
              {event.description && (
                <div className="prose prose-sm dark:prose-invert max-w-none pt-4 border-t">
                  <p className="whitespace-pre-wrap">{event.description}</p>
                </div>
              )}

              {/* Guest list */}
              {attendees.length > 0 && (
                <div className="pt-4 border-t">
                  <h3 className="text-sm font-medium mb-3">
                    {attendees.length} {attendees.length === 1 ? 'person' : 'people'} going
                  </h3>
                  <div className="flex -space-x-2">
                    {attendees.slice(0, 8).map((a) => (
                      <Avatar key={a.user.id} className="h-8 w-8 border-2 border-background">
                        <AvatarImage src={a.user.image || undefined} />
                        <AvatarFallback className="text-xs">
                          {a.user.name?.split(' ').map(n => n[0]).join('') || '?'}
                        </AvatarFallback>
                      </Avatar>
                    ))}
                    {attendees.length > 8 && (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-muted text-xs font-medium">
                        +{attendees.length - 8}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mobile sticky CTA */}
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/80 p-4 backdrop-blur-lg md:hidden">
          <EventRegistrationButton
            event={event}
            registration={registration}
            spotsRemaining={spotsRemaining}
          />
        </div>
      </div>
    </>
  );
}
```

**Step 3: Verify build**

Run: `pnpm build`

**Step 4: Commit**

```bash
git add components/user/event-registration-button.tsx app/(user)/user/events/
git commit -m "feat: add event detail page with registration flow and Luma-style layout"
```

---

### Task 10: Build member directory and profile pages

**Files:**
- Create: `app/(user)/user/directory/page.tsx`
- Create: `app/(user)/user/directory/[id]/page.tsx`
- Create: `app/(user)/user/profile/page.tsx`
- Create: `components/user/profile-form.tsx`

**Step 1: Create `app/(user)/user/directory/page.tsx`**

```typescript
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { getAllMembers } from '@/lib/db/event-queries';
import { PageHeader } from '@/components/ui/page-header';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import Link from 'next/link';

export default async function DirectoryPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const members = await getAllMembers();

  return (
    <>
      <PageHeader title="Member Directory" showSidebarTrigger />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-6">
          <div className="grid gap-3 sm:grid-cols-2">
            {members.map((member) => (
              <Link key={member.id} href={`/user/directory/${member.id}`}>
                <div className="flex items-center gap-3 rounded-xl border p-4 transition-colors hover:bg-muted/50">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={member.image || undefined} />
                    <AvatarFallback>
                      {member.name?.split(' ').map(n => n[0]).join('') || '?'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{member.name || 'Unknown'}</p>
                    <p className="text-sm text-muted-foreground truncate">
                      {[member.classYear && `Class of ${member.classYear}`, member.major]
                        .filter(Boolean).join(' · ') || member.email}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {members.length === 0 && (
            <div className="py-20 text-center text-muted-foreground">
              No members yet.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
```

**Step 2: Create `app/(user)/user/directory/[id]/page.tsx`**

```typescript
import { auth } from '@/auth';
import { redirect, notFound } from 'next/navigation';
import { getUserById } from '@/lib/db/queries';
import { PageHeader } from '@/components/ui/page-header';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, Phone, MapPin, GraduationCap, BookOpen } from 'lucide-react';

export default async function MemberProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const { id } = await params;
  const user = await getUserById(id);
  if (!user) notFound();

  return (
    <>
      <PageHeader title="Member Profile" showSidebarTrigger />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 py-8">
          {/* Header */}
          <div className="flex flex-col items-center text-center mb-8">
            <Avatar className="h-24 w-24 mb-4">
              <AvatarImage src={user.image || undefined} />
              <AvatarFallback className="text-2xl">
                {user.name?.split(' ').map(n => n[0]).join('') || '?'}
              </AvatarFallback>
            </Avatar>
            <h1 className="text-2xl font-bold">{user.name || 'Unknown'}</h1>
            {(user.classYear || user.major) && (
              <p className="text-muted-foreground mt-1">
                {[user.classYear && `Class of ${user.classYear}`, user.major]
                  .filter(Boolean).join(' · ')}
              </p>
            )}
          </div>

          <div className="space-y-6">
            {/* Bio */}
            {user.bio && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">About</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground whitespace-pre-wrap">{user.bio}</p>
                </CardContent>
              </Card>
            )}

            {/* Contact & Details */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{user.email}</span>
                </div>
                {user.phone && (
                  <div className="flex items-center gap-3">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{user.phone}</span>
                  </div>
                )}
                {user.location && (
                  <div className="flex items-center gap-3">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{user.location}</span>
                  </div>
                )}
                {user.major && (
                  <div className="flex items-center gap-3">
                    <GraduationCap className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{user.major}</span>
                  </div>
                )}
                {user.interests && (
                  <div className="flex items-center gap-3">
                    <BookOpen className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{user.interests}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
```

**Step 3: Create `components/user/profile-form.tsx`**

```typescript
'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { updateProfile } from '@/app/actions/profile';
import { useTransition } from 'react';
import { toast } from 'sonner';
import type { User } from '@/lib/db/schema';

export function ProfileForm({ user }: { user: User }) {
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (formData: FormData) => {
    startTransition(async () => {
      try {
        await updateProfile(formData);
        toast.success('Profile updated');
      } catch {
        toast.error('Failed to update profile');
      }
    });
  };

  return (
    <form action={handleSubmit} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="major">Major</Label>
          <Input id="major" name="major" defaultValue={user.major || ''} placeholder="e.g. Computer Science" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="classYear">Class Year</Label>
          <Input id="classYear" name="classYear" defaultValue={user.classYear || ''} placeholder="e.g. 2026" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" name="phone" defaultValue={user.phone || ''} placeholder="e.g. (617) 555-1234" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="location">Location</Label>
          <Input id="location" name="location" defaultValue={user.location || ''} placeholder="e.g. Cambridge, MA" />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="interests">Interests</Label>
        <Input id="interests" name="interests" defaultValue={user.interests || ''} placeholder="e.g. AI, robotics, coffee" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="bio">Bio</Label>
        <Textarea id="bio" name="bio" defaultValue={user.bio || ''} placeholder="Tell us about yourself..." rows={4} />
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? 'Saving...' : 'Save Profile'}
      </Button>
    </form>
  );
}
```

**Step 4: Create `app/(user)/user/profile/page.tsx`**

```typescript
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { getUserById } from '@/lib/db/queries';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ProfileForm } from '@/components/user/profile-form';

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const user = await getUserById(session.user.id);
  if (!user) redirect('/login');

  return (
    <>
      <PageHeader title="My Profile" showSidebarTrigger />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 py-8">
          <Card>
            <CardHeader>
              <CardTitle>Edit Profile</CardTitle>
              <CardDescription>
                Update your member profile information visible to other members.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ProfileForm user={user} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
```

**Step 5: Verify build**

Run: `pnpm build`

**Step 6: Commit**

```bash
git add app/(user)/user/directory/ app/(user)/user/profile/ components/user/profile-form.tsx
git commit -m "feat: add member directory, profile view, and profile editing"
```

---

### Task 11: Build admin event list and creation pages

**Files:**
- Create: `app/(admin)/admin/events/page.tsx`
- Create: `app/(admin)/admin/events/new/page.tsx`
- Create: `components/admin/event-form.tsx`

**Step 1: Create `app/(admin)/admin/events/page.tsx`**

```typescript
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { getEvents, getRegistrationCount } from '@/lib/db/event-queries';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Plus } from 'lucide-react';

const statusColors: Record<string, string> = {
  draft: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
  open: 'bg-green-500/10 text-green-500 border-green-500/20',
  closed: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  completed: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
};

export default async function AdminEventsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (!session.user.isAdmin) redirect('/user');

  const events = await getEvents();

  const eventsWithCounts = await Promise.all(
    events.map(async (event) => {
      const count = await getRegistrationCount(event.id);
      return { event, registrationCount: count };
    })
  );

  return (
    <>
      <PageHeader
        title="Events"
        showSidebarTrigger
        actions={
          <Link href="/admin/events/new">
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" />
              New Event
            </Button>
          </Link>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-6">
          {eventsWithCounts.length > 0 ? (
            <div className="space-y-2">
              {eventsWithCounts.map(({ event, registrationCount }) => (
                <Link key={event.id} href={`/admin/events/${event.id}`}>
                  <div className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted/50">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{event.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(event.date).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric',
                        })}
                        {event.location && ` · ${event.location}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 ml-4">
                      <span className="text-sm text-muted-foreground">
                        {registrationCount} / {event.capacity}
                      </span>
                      <Badge variant="outline" className={statusColors[event.status] || ''}>
                        {event.status}
                      </Badge>
                      <Badge variant="outline">{event.type}</Badge>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="py-20 text-center text-muted-foreground">
              <p>No events yet.</p>
              <Link href="/admin/events/new">
                <Button className="mt-4">Create Your First Event</Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
```

**Step 2: Create `components/admin/event-form.tsx`**

```typescript
'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { createEventAction, updateEventAction } from '@/app/actions/events';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { Event } from '@/lib/db/schema';

function toDatetimeLocal(date: Date | null | undefined): string {
  if (!date) return '';
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function EventForm({ event }: { event?: Event }) {
  const [eventType, setEventType] = useState<'waitlist' | 'lottery'>(event?.type || 'waitlist');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleSubmit = (formData: FormData) => {
    formData.set('type', eventType);

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
        toast.error(error instanceof Error ? error.message : 'Failed to save event');
      }
    });
  };

  return (
    <form action={handleSubmit}>
      <div className="grid gap-8 md:grid-cols-[280px_1fr]">
        {/* Sidebar */}
        <aside className="space-y-6">
          {/* Cover image */}
          <div>
            <Label>Cover Image URL</Label>
            <Input
              name="coverImage"
              defaultValue={event?.coverImage || ''}
              placeholder="https://..."
              className="mt-1"
            />
          </div>

          {/* Event type */}
          <div className="space-y-3">
            <Label>Event Type</Label>
            <RadioGroup
              value={eventType}
              onValueChange={(v) => setEventType(v as 'waitlist' | 'lottery')}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="waitlist" id="waitlist" />
                <Label htmlFor="waitlist" className="font-normal">Waitlist</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="lottery" id="lottery" />
                <Label htmlFor="lottery" className="font-normal">Lottery</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Lottery deadline */}
          {eventType === 'lottery' && (
            <div className="space-y-2">
              <Label htmlFor="lotteryDeadline">Lottery Deadline</Label>
              <Input
                id="lotteryDeadline"
                name="lotteryDeadline"
                type="datetime-local"
                defaultValue={toDatetimeLocal(event?.lotteryDeadline)}
              />
            </div>
          )}

          {/* Status */}
          <div className="space-y-3">
            <Label>Status</Label>
            <RadioGroup name="status" defaultValue={event?.status || 'draft'}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="draft" id="draft" />
                <Label htmlFor="draft" className="font-normal">Draft</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="open" id="open" />
                <Label htmlFor="open" className="font-normal">Published</Label>
              </div>
            </RadioGroup>
          </div>
        </aside>

        {/* Main form */}
        <div className="space-y-6">
          <div>
            <Input
              name="name"
              defaultValue={event?.name || ''}
              placeholder="Event Name"
              className="border-0 text-3xl font-bold placeholder:text-muted-foreground/40 focus-visible:ring-0 p-0 h-auto"
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="date">Start Date & Time</Label>
              <Input
                id="date"
                name="date"
                type="datetime-local"
                defaultValue={toDatetimeLocal(event?.date)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">End Date & Time</Label>
              <Input
                id="endDate"
                name="endDate"
                type="datetime-local"
                defaultValue={toDatetimeLocal(event?.endDate)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                name="location"
                defaultValue={event?.location || ''}
                placeholder="e.g. MIT Media Lab, E14-633"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="capacity">Capacity</Label>
              <Input
                id="capacity"
                name="capacity"
                type="number"
                min={1}
                defaultValue={event?.capacity || ''}
                placeholder="e.g. 50"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              defaultValue={event?.description || ''}
              placeholder="Describe the event..."
              rows={6}
            />
          </div>

          <Button type="submit" size="lg" className="rounded-xl" disabled={isPending}>
            {isPending ? 'Saving...' : event ? 'Update Event' : 'Create Event'}
          </Button>
        </div>
      </div>
    </form>
  );
}
```

**Step 3: Create `app/(admin)/admin/events/new/page.tsx`**

```typescript
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { EventForm } from '@/components/admin/event-form';

export default async function NewEventPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (!session.user.isAdmin) redirect('/user');

  return (
    <>
      <PageHeader title="Create Event" showSidebarTrigger />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-4 py-8">
          <EventForm />
        </div>
      </div>
    </>
  );
}
```

**Step 4: Verify build**

Run: `pnpm build`

**Step 5: Commit**

```bash
git add app/(admin)/admin/events/ components/admin/event-form.tsx
git commit -m "feat: add admin event list and event creation form"
```

---

### Task 12: Build admin event management page with registrations and lottery

**Files:**
- Create: `app/(admin)/admin/events/[id]/page.tsx`
- Create: `components/admin/registrations-table.tsx`
- Create: `components/admin/lottery-draw.tsx`

**Step 1: Create `components/admin/registrations-table.tsx`**

```typescript
'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { removeRegistration } from '@/app/actions/events';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';

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

  if (registrations.length === 0) {
    return <p className="py-8 text-center text-muted-foreground">No registrations yet.</p>;
  }

  return (
    <div className="space-y-1">
      {registrations.map(({ registration, user }) => (
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
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => handleRemove(registration.id)}
              disabled={isPending}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

**Step 2: Create `components/admin/lottery-draw.tsx`**

```typescript
'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { runLottery } from '@/app/actions/events';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Sparkles } from 'lucide-react';

interface LotteryResult {
  selected: { name: string | null; email: string | null; score: number }[];
  rejected: { name: string | null; email: string | null; score: number }[];
}

export function LotteryDraw({ eventId, entrantCount }: { eventId: string; entrantCount: number }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [result, setResult] = useState<LotteryResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleDraw = () => {
    startTransition(async () => {
      try {
        const res = await runLottery(eventId);
        setResult(res);
        setShowConfirm(false);
        toast.success('Lottery completed!');
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
        className="gap-2"
      >
        <Sparkles className="h-4 w-4" />
        Run Lottery ({entrantCount} entrants)
      </Button>

      {/* Confirmation dialog */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Run Lottery Draw</DialogTitle>
            <DialogDescription>
              This will select winners from {entrantCount} entrants using weighted random selection.
              Priority scores: base 1.0, +0.5 per past loss, -1.0 per past no-show.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirm(false)}>Cancel</Button>
            <Button onClick={handleDraw} disabled={isPending}>
              {isPending ? 'Drawing...' : 'Confirm Draw'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Results dialog */}
      <Dialog open={!!result} onOpenChange={() => setResult(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Lottery Results</DialogTitle>
          </DialogHeader>
          {result && (
            <div className="space-y-4 max-h-96 overflow-y-auto">
              <div>
                <h4 className="text-sm font-medium text-green-600 mb-2">
                  Selected ({result.selected.length})
                </h4>
                {result.selected.map((s, i) => (
                  <div key={i} className="flex justify-between py-1 text-sm">
                    <span>{s.name || s.email}</span>
                    <span className="text-muted-foreground">Score: {s.score.toFixed(1)}</span>
                  </div>
                ))}
              </div>
              <div>
                <h4 className="text-sm font-medium text-red-600 mb-2">
                  Not Selected ({result.rejected.length})
                </h4>
                {result.rejected.map((s, i) => (
                  <div key={i} className="flex justify-between py-1 text-sm">
                    <span>{s.name || s.email}</span>
                    <span className="text-muted-foreground">Score: {s.score.toFixed(1)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setResult(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

**Step 3: Create `app/(admin)/admin/events/[id]/page.tsx`**

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
  const entrantCount = registrations.filter(r => r.registration.status === 'lottery_entered').length;

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
          <Tabs defaultValue="registrations">
            <TabsList>
              <TabsTrigger value="registrations">
                Registrations ({registrations.length})
              </TabsTrigger>
              <TabsTrigger value="edit">Edit Event</TabsTrigger>
            </TabsList>

            <TabsContent value="registrations" className="mt-6">
              {event.type === 'lottery' && event.status === 'open' && (
                <div className="mb-6">
                  <LotteryDraw eventId={id} entrantCount={entrantCount} />
                </div>
              )}
              <RegistrationsTable
                registrations={registrations}
                eventId={id}
                showPriority={event.type === 'lottery'}
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

**Step 4: Verify build**

Run: `pnpm build`

**Step 5: Commit**

```bash
git add app/(admin)/admin/events/[id]/page.tsx components/admin/registrations-table.tsx components/admin/lottery-draw.tsx
git commit -m "feat: add admin event management with registrations table and lottery draw"
```

---

### Task 13: Build check-in mode page

**Files:**
- Create: `app/(admin)/admin/events/[id]/checkin/page.tsx`
- Create: `components/admin/checkin-list.tsx`

**Step 1: Create `components/admin/checkin-list.tsx`**

```typescript
'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { checkinAttendee, undoCheckin, closeEvent } from '@/app/actions/events';
import { useState, useTransition, useMemo } from 'react';
import { toast } from 'sonner';
import { Check, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

interface Attendee {
  registration: {
    id: string;
    status: string;
  };
  user: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
  };
}

export function CheckinList({
  attendees,
  eventId,
  eventName,
}: {
  attendees: Attendee[];
  eventId: string;
  eventName: string;
}) {
  const [search, setSearch] = useState('');
  const [isPending, startTransition] = useTransition();
  const [showClose, setShowClose] = useState(false);

  const checkedInCount = attendees.filter(a => a.registration.status === 'checked_in').length;
  const total = attendees.length;
  const percent = total > 0 ? Math.round((checkedInCount / total) * 100) : 0;

  const filtered = useMemo(() => {
    if (!search) return attendees;
    const q = search.toLowerCase();
    return attendees.filter(a =>
      a.user.name?.toLowerCase().includes(q) ||
      a.user.email?.toLowerCase().includes(q)
    );
  }, [attendees, search]);

  const handleToggle = (attendee: Attendee) => {
    startTransition(async () => {
      try {
        if (attendee.registration.status === 'checked_in') {
          const prev = attendee.registration.status === 'checked_in' ? 'registered' : 'selected';
          await undoCheckin(attendee.registration.id, eventId, prev as 'registered' | 'selected');
        } else {
          await checkinAttendee(attendee.registration.id, eventId);
        }
      } catch {
        toast.error('Failed to update check-in');
      }
    });
  };

  const handleClose = () => {
    startTransition(async () => {
      try {
        await closeEvent(eventId);
        toast.success('Event closed. No-shows have been recorded.');
        setShowClose(false);
      } catch {
        toast.error('Failed to close event');
      }
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 border-b p-4 space-y-3">
        <h1 className="text-lg font-semibold truncate">{eventName}</h1>
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold">{checkedInCount} / {total}</span>
          <span className="text-sm text-muted-foreground">checked in</span>
        </div>
        <Progress value={percent} className="h-2" />

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search attendees..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            autoFocus
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.map((attendee) => {
          const isCheckedIn = attendee.registration.status === 'checked_in';
          return (
            <button
              key={attendee.registration.id}
              onClick={() => handleToggle(attendee)}
              disabled={isPending}
              className={`flex w-full items-center gap-3 border-b px-4 py-3 text-left transition-colors ${
                isCheckedIn ? 'bg-green-500/5 opacity-60' : 'hover:bg-muted/50'
              }`}
            >
              <Avatar className="h-10 w-10 shrink-0">
                <AvatarImage src={attendee.user.image || undefined} />
                <AvatarFallback>
                  {attendee.user.name?.split(' ').map(n => n[0]).join('') || '?'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{attendee.user.name || 'Unknown'}</p>
                <p className="text-sm text-muted-foreground truncate">{attendee.user.email}</p>
              </div>
              <div className={`flex h-8 w-8 items-center justify-center rounded-full border-2 shrink-0 ${
                isCheckedIn
                  ? 'border-green-500 bg-green-500 text-white'
                  : 'border-muted-foreground/30'
              }`}>
                {isCheckedIn && <Check className="h-4 w-4" />}
              </div>
            </button>
          );
        })}
      </div>

      {/* Close event button */}
      <div className="shrink-0 border-t p-4">
        <Button
          variant="destructive"
          className="w-full"
          onClick={() => setShowClose(true)}
        >
          Close Event
        </Button>
      </div>

      <Dialog open={showClose} onOpenChange={setShowClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close Event</DialogTitle>
            <DialogDescription>
              This will mark {total - checkedInCount} unchecked attendees as no-shows.
              No-shows affect lottery priority scores. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClose(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleClose} disabled={isPending}>
              {isPending ? 'Closing...' : 'Confirm Close'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

**Step 2: Create `app/(admin)/admin/events/[id]/checkin/page.tsx`**

```typescript
import { auth } from '@/auth';
import { redirect, notFound } from 'next/navigation';
import { getEventById, getCheckinAttendees } from '@/lib/db/event-queries';
import { CheckinList } from '@/components/admin/checkin-list';

export default async function CheckinPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (!session.user.isAdmin) redirect('/user');

  const { id } = await params;
  const event = await getEventById(id);
  if (!event) notFound();

  const attendees = await getCheckinAttendees(id);

  return (
    <div className="flex h-screen flex-col">
      <CheckinList attendees={attendees} eventId={id} eventName={event.name} />
    </div>
  );
}
```

**Step 3: Verify build**

Run: `pnpm build`

**Step 4: Commit**

```bash
git add app/(admin)/admin/events/[id]/checkin/ components/admin/checkin-list.tsx
git commit -m "feat: add mobile-optimized check-in mode for event attendance"
```

---

### Task 14: Update admin dashboard with event analytics

**Files:**
- Modify: `app/(admin)/admin/page.tsx`

**Step 1: Add event stats to the dashboard**

In `app/(admin)/admin/page.tsx`:

Add import at top:
```typescript
import { getEventStats } from '@/lib/db/event-queries';
import { Calendar, BarChart3, UserX } from 'lucide-react';
```

Add after `const recentUsers = await getRecentUsers(5);`:
```typescript
const eventStats = await getEventStats();
```

Add a second row of stat cards after the existing KPI grid (after the closing `</div>` of the `lg:grid-cols-4` grid):

```tsx
{/* Event Stats */}
<div className="grid gap-4 md:grid-cols-3">
  <StatCard
    title="Total Events"
    value={eventStats.totalEvents}
    icon={Calendar}
    description="Completed events"
  />
  <StatCard
    title="Attendance Rate"
    value={`${eventStats.avgAttendanceRate}%`}
    icon={BarChart3}
    description="Average across events"
  />
  <StatCard
    title="No-Show Rate"
    value={`${eventStats.noShowRate}%`}
    icon={UserX}
    description="Average across events"
  />
</div>
```

Also add an "Events" quick action link in the Quick Actions card:
```tsx
<Link href="/admin/events">
  <Button variant="outline" className="w-full justify-start">
    <Calendar className="mr-2 h-4 w-4" />
    Manage Events
  </Button>
</Link>
```

**Step 2: Verify build**

Run: `pnpm build`

**Step 3: Commit**

```bash
git add app/(admin)/admin/page.tsx
git commit -m "feat: add event analytics stats to admin dashboard"
```

---

### Task 15: Update admin user detail page with real data and attendance stats

Replace the fake-data user detail page with real DB queries and add event attendance history.

**Files:**
- Modify: `app/(admin)/admin/users/[id]/page.tsx`

**Step 1: Rewrite the user detail page**

Replace the entire file. The new version:
- Is a server component (not client)
- Fetches from DB instead of fake data
- Shows real attendance stats from event registrations
- Shows lottery win/loss record
- Shows attendance history list

```typescript
import { auth } from '@/auth';
import { redirect, notFound } from 'next/navigation';
import { getUserById } from '@/lib/db/queries';
import { getUserEventHistory, getUserLotteryStats, getUserNoShowCount } from '@/lib/db/event-queries';
import { PageHeader } from '@/components/ui/page-header';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import {
  ArrowLeft, Mail, Phone, MapPin, GraduationCap,
  Calendar, BarChart3, Users, Trophy, XCircle,
} from 'lucide-react';

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (!session.user.isAdmin) redirect('/user');

  const { id } = await params;
  const user = await getUserById(id);
  if (!user) notFound();

  const [eventHistory, lotteryStats, noShowCount] = await Promise.all([
    getUserEventHistory(id),
    getUserLotteryStats(id),
    getUserNoShowCount(id),
  ]);

  const eventsAttended = eventHistory.filter(h => h.registration.status === 'checked_in').length;
  const totalEvents = eventHistory.length;

  return (
    <>
      <PageHeader title="User Details" showSidebarTrigger />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <Link href="/admin/users">
            <Button variant="ghost" size="sm" className="mb-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Directory
            </Button>
          </Link>

          {/* Profile header */}
          <div className="flex flex-col md:flex-row gap-6 items-start md:items-center mb-8">
            <Avatar className="h-20 w-20">
              <AvatarImage src={user.image || undefined} />
              <AvatarFallback className="text-2xl">
                {user.name?.split(' ').map(n => n[0]).join('') || '?'}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-2xl font-bold">{user.name || 'Unknown'}</h1>
              <p className="text-muted-foreground">{user.email}</p>
              {(user.classYear || user.major) && (
                <p className="text-sm text-muted-foreground mt-1">
                  {[user.classYear && `Class of ${user.classYear}`, user.major].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Contact info */}
            <div className="space-y-6">
              <Card>
                <CardHeader><CardTitle className="text-lg">Contact</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{user.email}</span>
                  </div>
                  {user.phone && (
                    <div className="flex items-center gap-3">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{user.phone}</span>
                    </div>
                  )}
                  {user.location && (
                    <div className="flex items-center gap-3">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{user.location}</span>
                    </div>
                  )}
                  {user.major && (
                    <div className="flex items-center gap-3">
                      <GraduationCap className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{user.major}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {user.bio && (
                <Card>
                  <CardHeader><CardTitle className="text-lg">About</CardTitle></CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{user.bio}</p>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Stats & History */}
            <div className="lg:col-span-2 space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-4 text-center">
                    <Users className="h-5 w-5 mx-auto mb-1 text-primary" />
                    <p className="text-2xl font-bold">{eventsAttended}</p>
                    <p className="text-xs text-muted-foreground">Attended</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <XCircle className="h-5 w-5 mx-auto mb-1 text-destructive" />
                    <p className="text-2xl font-bold">{noShowCount}</p>
                    <p className="text-xs text-muted-foreground">No-Shows</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <Trophy className="h-5 w-5 mx-auto mb-1 text-amber-500" />
                    <p className="text-2xl font-bold">{lotteryStats.wins}</p>
                    <p className="text-xs text-muted-foreground">Lottery Wins</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <BarChart3 className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                    <p className="text-2xl font-bold">{lotteryStats.losses}</p>
                    <p className="text-xs text-muted-foreground">Lottery Losses</p>
                  </CardContent>
                </Card>
              </div>

              {/* Event history */}
              <Card>
                <CardHeader><CardTitle className="text-lg">Event History</CardTitle></CardHeader>
                <CardContent>
                  {eventHistory.length > 0 ? (
                    <div className="space-y-3">
                      {eventHistory.map((h) => (
                        <div key={h.registration.id} className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium">{h.event.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(h.event.date).toLocaleDateString('en-US', {
                                month: 'short', day: 'numeric', year: 'numeric',
                              })}
                            </p>
                          </div>
                          <Badge variant="outline" className="text-xs">
                            {h.registration.status.replace('_', ' ')}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No event history.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
```

**Step 2: Verify build**

Run: `pnpm build`

**Step 3: Commit**

```bash
git add app/(admin)/admin/users/[id]/page.tsx
git commit -m "feat: replace fake-data user detail page with real DB queries and event stats"
```

---

### Task 16: Update admin Team Directory to use real data

Replace fake data in the admin users page with real DB queries.

**Files:**
- Modify: `app/(admin)/admin/users/page.tsx`
- Modify: `components/admin/user-row.tsx`

**Step 1: Rewrite `app/(admin)/admin/users/page.tsx`**

Replace the entire file. Convert from client component to a server component that fetches from DB, with a client search wrapper:

```typescript
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { getAllMembers } from '@/lib/db/event-queries';
import { PageHeader } from '@/components/ui/page-header';
import { MemberSearch } from '@/components/admin/member-search';

export default async function UsersPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (!session.user.isAdmin) redirect('/user');

  const members = await getAllMembers();

  return (
    <>
      <PageHeader title="Team Directory" showSidebarTrigger />
      <MemberSearch members={members} />
    </>
  );
}
```

**Step 2: Create `components/admin/member-search.tsx`**

This is the client component that handles filtering (extracted from the old page):

```typescript
'use client';

import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Search, Users, ChevronRight } from 'lucide-react';
import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';

interface Member {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  major: string | null;
  classYear: string | null;
}

export function MemberSearch({ members }: { members: Member[] }) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = useMemo(() => {
    if (!searchQuery) return members;
    const q = searchQuery.toLowerCase();
    return members.filter(m =>
      m.name?.toLowerCase().includes(q) ||
      m.email?.toLowerCase().includes(q) ||
      m.classYear?.toLowerCase().includes(q) ||
      m.major?.toLowerCase().includes(q)
    );
  }, [members, searchQuery]);

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b bg-background/95 backdrop-blur px-4 py-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <p className="text-sm text-muted-foreground">
            {filtered.length} of {members.length} members
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, major, or class year..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.map((member) => (
          <div
            key={member.id}
            onClick={() => router.push(`/admin/users/${member.id}`)}
            className="flex items-center gap-4 px-4 py-3 cursor-pointer transition-colors border-b hover:bg-muted/50"
          >
            <Avatar className="h-10 w-10 shrink-0">
              <AvatarImage src={member.image || undefined} />
              <AvatarFallback className="text-sm">
                {member.name?.split(' ').map(n => n[0]).join('') || '?'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{member.name || 'Unknown'}</p>
              <p className="text-sm text-muted-foreground truncate">{member.email}</p>
            </div>
            <div className="hidden sm:block text-sm text-muted-foreground">
              {[member.classYear, member.major].filter(Boolean).join(' · ')}
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="py-12 text-center text-muted-foreground">
            No members found.
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 3: Update `components/admin/user-row.tsx`**

This file can now be deleted since we replaced it with `member-search.tsx`. However, since it might be imported elsewhere, verify first:

Run: `grep -r "user-row" --include="*.tsx" --include="*.ts" app/ components/`

If only the old users page imported it (which is now rewritten), delete the file:

```bash
git rm components/admin/user-row.tsx
```

Also delete `lib/fake-data.ts` since nothing uses it anymore:

```bash
git rm lib/fake-data.ts
```

**Step 4: Verify build**

Run: `pnpm build`

If there are import errors for `fake-data` or `user-row` elsewhere, fix them.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: replace fake Team Directory with real DB-backed member list"
```

---

### Task 17: Final build verification and cleanup

**Step 1: Full production build**

Run:
```bash
pnpm build
```

Fix any TypeScript or build errors.

**Step 2: Lint check**

Run:
```bash
pnpm lint
```

Fix any lint errors.

**Step 3: Manual smoke test checklist**

Run `pnpm dev` and verify these routes:

- [ ] `/user/events` — shows event catalog (empty state if no events)
- [ ] `/user/directory` — shows member directory from DB
- [ ] `/user/profile` — shows profile edit form
- [ ] `/admin` — dashboard with event stats cards
- [ ] `/admin/events` — event management list
- [ ] `/admin/events/new` — event creation form
- [ ] `/admin/users` — team directory from real data
- [ ] `/admin/users/[id]` — user detail with event history

**Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address build/lint issues from events MVP"
```
