# User Page Performance Optimization — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate the N+1 query bottleneck on the events timeline, add loading skeletons for instant perceived performance, and cache queries to reduce redundant DB hits.

**Architecture:** Rewrite `getUserEvents` to use a single Drizzle subquery instead of N+1 individual count queries. Bump the connection pool from 1→5 so `Promise.all` can parallelize. Add `loading.tsx` files for streaming skeletons. Wrap key queries with `unstable_cache` and invalidate via `revalidateTag` in server actions.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM, postgres-js, `unstable_cache` / `revalidateTag`, Tailwind CSS (skeleton animations)

---

### Task 1: Bump Connection Pool

**Files:**
- Modify: `lib/db/index.ts:9`

**Step 1: Change the pool max**

Open `lib/db/index.ts` and change `max: 1` to `max: 5`:

```typescript
const client = postgres(connectionString, {
  ssl: 'require',
  max: 5,          // Was 1 — allow concurrent queries
  idle_timeout: 20,
  connect_timeout: 10,
});
```

**Step 2: Verify the build**

Run: `pnpm build`
Expected: Build succeeds with no errors.

**Step 3: Commit**

```bash
git add lib/db/index.ts
git commit -m "perf: bump postgres connection pool from 1 to 5"
```

---

### Task 2: Rewrite `getUserEvents` to Single Query

**Files:**
- Modify: `lib/db/event-queries.ts:182-219`

**Step 1: Rewrite the function**

Replace the entire `getUserEvents` function (lines 182-219) with this single-query version:

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

  // Single query: user registrations + events + aggregated counts
  const rows = await db
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

  return rows.map((row) => ({
    event: row.event,
    registrationStatus: row.registrationStatus,
    registeredCount: row.registeredCount ?? 0,
  }));
}
```

**Important:** You need `count` and `inArray` already imported at the top of `event-queries.ts`. Verify the existing imports include them (they should — check line 3).

**Step 2: Verify the build**

Run: `pnpm build`
Expected: Build succeeds. No type errors.

**Step 3: Test manually**

Run: `pnpm dev`, navigate to `/user/events`. Verify:
- Events display with correct registration counts
- Upcoming/past toggle works
- Page loads noticeably faster

**Step 4: Commit**

```bash
git add lib/db/event-queries.ts
git commit -m "perf: eliminate N+1 query in getUserEvents with subquery"
```

---

### Task 3: Events Timeline Loading Skeleton

**Files:**
- Create: `app/(user)/user/events/loading.tsx`

**Step 1: Create the skeleton file**

Create `app/(user)/user/events/loading.tsx`:

```tsx
export default function EventsLoading() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-8">
        {/* Header skeleton */}
        <div className="mb-8 flex items-center justify-between">
          <div className="h-8 w-32 animate-pulse rounded-lg bg-muted" />
          <div className="h-9 w-48 animate-pulse rounded-full bg-muted" />
        </div>

        {/* Timeline skeleton — 3 date groups */}
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, groupIdx) => (
            <div key={groupIdx}>
              {/* Date label */}
              <div className="mb-3 flex items-center gap-3">
                <div className="h-2.5 w-2.5 rounded-full bg-muted" />
                <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                <div className="h-4 w-16 animate-pulse rounded bg-muted" />
              </div>

              {/* Event cards */}
              <div className="ml-[22px] space-y-3 md:ml-0">
                {Array.from({ length: groupIdx === 0 ? 2 : 1 }).map((_, cardIdx) => (
                  <div
                    key={cardIdx}
                    className="flex gap-4 rounded-xl bg-card p-4 shadow-[0_2px_12px_-2px_rgba(0,0,0,0.08)]"
                  >
                    {/* Left: text placeholders */}
                    <div className="flex flex-1 flex-col gap-2">
                      <div className="h-4 w-16 animate-pulse rounded bg-muted" />
                      <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
                      <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
                      <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
                    </div>
                    {/* Right: image placeholder */}
                    <div className="h-[110px] w-[110px] shrink-0 animate-pulse rounded-lg bg-muted sm:h-[120px] sm:w-[120px]" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Verify**

Run: `pnpm dev`, navigate to `/user/events`. On first load (or hard refresh), you should briefly see the pulsing skeleton before content streams in. You can also add a temporary `await new Promise(r => setTimeout(r, 2000))` at the top of the events page to see the skeleton clearly. Remove it after verifying.

**Step 3: Commit**

```bash
git add app/\(user\)/user/events/loading.tsx
git commit -m "feat: add loading skeleton for events timeline"
```

---

### Task 4: Member Directory Loading Skeleton

**Files:**
- Create: `app/(user)/user/directory/loading.tsx`

**Step 1: Create the skeleton file**

Create `app/(user)/user/directory/loading.tsx`:

```tsx
export default function DirectoryLoading() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-8">
        {/* Header skeleton */}
        <div className="mb-8">
          <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />
        </div>

        {/* Member grid skeleton — 6 cards in 2-col grid */}
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-xl border p-4"
            >
              {/* Avatar placeholder */}
              <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-muted" />
              {/* Text placeholders */}
              <div className="flex-1 space-y-2">
                <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Verify**

Run: `pnpm dev`, navigate to `/user/directory`. Skeleton should flash on initial load.

**Step 3: Commit**

```bash
git add app/\(user\)/user/directory/loading.tsx
git commit -m "feat: add loading skeleton for member directory"
```

---

### Task 5: Cache `getUserEvents` with `unstable_cache`

**Files:**
- Modify: `lib/db/event-queries.ts` (add import, wrap function)

**Step 1: Add the cached wrapper**

At the top of `lib/db/event-queries.ts`, add the import:

```typescript
import { unstable_cache } from 'next/cache';
```

Then, below the existing `getUserEvents` function, rename it and add a cached wrapper:

1. Rename the current `getUserEvents` to `_getUserEvents` (prefix with underscore, remove `export`)
2. Add the cached export:

```typescript
// Rename: export async function getUserEvents → async function _getUserEvents
async function _getUserEvents(userId: string, filter?: 'upcoming' | 'past') {
  // ... existing implementation stays the same ...
}

export const getUserEvents = unstable_cache(
  _getUserEvents,
  ['user-events'],
  { tags: ['events'], revalidate: 60 }
);
```

**Note:** `unstable_cache` automatically appends function arguments to the cache key, so `userId` and `filter` are included without explicit key arrays.

**Step 2: Verify the build**

Run: `pnpm build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add lib/db/event-queries.ts
git commit -m "perf: cache getUserEvents with unstable_cache (60s, tag: events)"
```

---

### Task 6: Cache `getAllMembers` with `unstable_cache`

**Files:**
- Modify: `lib/db/event-queries.ts` (wrap function)

**Step 1: Add the cached wrapper**

Same pattern as Task 5. Rename and wrap:

```typescript
async function _getAllMembers() {
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

export const getAllMembers = unstable_cache(
  _getAllMembers,
  ['members'],
  { tags: ['members'], revalidate: 300 }
);
```

**Step 2: Verify the build**

Run: `pnpm build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add lib/db/event-queries.ts
git commit -m "perf: cache getAllMembers with unstable_cache (300s, tag: members)"
```

---

### Task 7: Add `revalidateTag` to Server Actions

**Files:**
- Modify: `app/actions/events.ts`
- Modify: `app/actions/profile.ts`

**Step 1: Update events.ts**

Add the import at the top of `app/actions/events.ts`:

```typescript
import { revalidatePath, revalidateTag } from 'next/cache';
```

Then add `revalidateTag('events')` in these functions (place it alongside existing `revalidatePath` calls):

- `createEventAction` — after line 41 (after `revalidatePath('/admin/events')`)
- `updateEventAction` — after line 65
- `registerForEvent` — after line 103
- `cancelRegistration` — after line 126
- `runLottery` — after line 194
- `closeEvent` — after line 227
- `removeRegistration` — after line 241

**Step 2: Update profile.ts**

Add the import at the top of `app/actions/profile.ts`:

```typescript
import { revalidatePath, revalidateTag } from 'next/cache';
```

Then add `revalidateTag('members')` after line 23 (after `revalidatePath('/user/directory')`).

**Step 3: Verify the build**

Run: `pnpm build`
Expected: Build succeeds.

**Step 4: Test manually**

Run: `pnpm dev`. Register for an event, then navigate to `/user/events`. The registration count should reflect the change without waiting for the 60s TTL.

**Step 5: Commit**

```bash
git add app/actions/events.ts app/actions/profile.ts
git commit -m "perf: add revalidateTag calls for cache invalidation"
```

---

## Verification Checklist

After all tasks are complete:

1. `pnpm build` succeeds with no errors
2. `/user/events` loads with skeleton, then shows events with correct counts
3. `/user/directory` loads with skeleton, then shows members
4. Registering/canceling an event immediately updates counts (cache busted)
5. Updating profile immediately reflects in directory (cache busted)
6. No N+1 queries visible in Supabase logs (single query per page load)
