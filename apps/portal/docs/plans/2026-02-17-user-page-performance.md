# User Page Performance Optimization

## Problem

The events timeline page (`/user/events`) has a noticeable delay caused by an N+1 query pattern. For each event the user is registered for, a separate `getRegistrationCount` query runs sequentially. With 10 events, that's 11 DB round-trips through a connection pool limited to 1.

The member directory (`/user/directory`) is less affected but still benefits from caching and loading skeletons.

## Solution

Four changes, ordered by impact:

### 1. Eliminate N+1 Query in `getUserEvents`

**File:** `lib/db/event-queries.ts`

Replace the current pattern (1 JOIN query + N individual count queries in `Promise.all`) with a single query using a Drizzle subquery for registration counts:

```typescript
const registeredCountSq = db
  .select({
    eventId: eventRegistrations.eventId,
    count: count().as('count'),
  })
  .from(eventRegistrations)
  .where(inArray(eventRegistrations.status, ['registered', 'selected', 'checked_in']))
  .groupBy(eventRegistrations.eventId)
  .as('registered_counts');

// Single query: events + user registration status + aggregate count
const rows = await db.select({
    event: events,
    registrationStatus: eventRegistrations.status,
    registeredCount: registeredCountSq.count,
  })
  .from(eventRegistrations)
  .innerJoin(events, eq(eventRegistrations.eventId, events.id))
  .leftJoin(registeredCountSq, eq(events.id, registeredCountSq.eventId))
  .where(and(...conditions))
  .orderBy(...);
```

**Impact:** 1 round-trip instead of N+1.

### 2. Bump Connection Pool

**File:** `lib/db/index.ts`

Change `max: 1` to `max: 5`. This allows `Promise.all` calls (like on the event detail page) to actually parallelize queries.

### 3. Loading Skeletons (Streaming)

**New files:**
- `app/(user)/user/events/loading.tsx` — animated pulse skeleton matching the event timeline layout (date headers + card placeholders)
- `app/(user)/user/directory/loading.tsx` — animated pulse skeleton matching the 2-column member grid

Next.js App Router automatically wraps page content in a Suspense boundary using `loading.tsx` as the fallback. This gives instant visual feedback while the server streams the real content.

### 4. Query Caching with `unstable_cache`

Wrap frequently-hit queries:

| Query | Cache Key | Tag | Revalidate |
|-------|-----------|-----|------------|
| `getUserEvents` | `['user-events', userId, filter]` | `'events'` | 60s |
| `getAllMembers` | `['members']` | `'members'` | 300s |

**Cache invalidation via `revalidateTag`:**
- `app/actions/events.ts`: Add `revalidateTag('events')` in `registerForEvent`, `cancelRegistration`, `createEventAction`, `updateEventAction`, `runLottery`, `closeEvent`, `removeRegistration`
- `app/actions/profile.ts`: Add `revalidateTag('members')` in `updateProfile`

## Files Changed

| File | Change |
|------|--------|
| `lib/db/event-queries.ts` | Rewrite `getUserEvents` with subquery; wrap with `unstable_cache` |
| `lib/db/index.ts` | `max: 1` → `max: 5` |
| `app/actions/events.ts` | Add `revalidateTag('events')` calls |
| `app/actions/profile.ts` | Add `revalidateTag('members')` calls |
| `app/(user)/user/events/loading.tsx` | **New** — event timeline skeleton |
| `app/(user)/user/directory/loading.tsx` | **New** — member directory skeleton |
