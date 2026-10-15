# Event Timezone Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the timezone picker functional so event times are stored correctly relative to the selected timezone, and display all event times in the viewer's local browser timezone on both admin and user sides.

**Architecture:** Add a `timezone` text column to the `events` table. On save, convert the admin's wall-clock date input through the selected timezone to UTC. On display, use a shared `'use client'` component (`<FormattedTime>`) that formats dates in the viewer's browser timezone. Convert server-side date formatting in user portal components to use this client component.

**Tech Stack:** Drizzle ORM (schema), Zod (validation), native `Intl.DateTimeFormat` (timezone math), React client components (display)

**Spec:** `docs/superpowers/specs/2026-04-06-event-timezone-fix-design.md`

---

### Task 1: Add `timezone` column to schema and validation

**Files:**
- Modify: `lib/db/schema.ts:82-103` (events table)
- Modify: `lib/validations/events.ts:11-24` (eventBaseSchema)

- [ ] **Step 1: Add timezone column to events table in schema**

In `lib/db/schema.ts`, add a `timezone` field to the `events` table definition, after line 93 (`requireApproval`):

```ts
timezone: text('timezone').notNull().default('America/New_York'),
```

- [ ] **Step 2: Add timezone to Zod validation schema**

In `lib/validations/events.ts`, add `timezone` to `eventBaseSchema` after line 23 (`questions`):

```ts
timezone: z.string().min(1, 'Timezone is required'),
```

- [ ] **Step 3: Push schema to database**

Run: `pnpm db:push`

Expected: Schema pushed successfully, `timezone` column added with default `'America/New_York'`.

- [ ] **Step 4: Backfill existing events**

Run via Supabase MCP (`execute_sql`):

```sql
UPDATE events SET timezone = 'America/New_York' WHERE timezone IS NULL;
```

Expected: All existing rows now have `timezone = 'America/New_York'`.

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema.ts lib/validations/events.ts
git commit -m "feat: add timezone column to events table and Zod schema"
```

---

### Task 2: Wire timezone through server actions

**Files:**
- Modify: `app/actions/events.ts:48-82` (createEventAction)
- Modify: `app/actions/events.ts:84-116` (updateEventAction)

- [ ] **Step 1: Pass timezone in createEventAction**

In `app/actions/events.ts`, inside `createEventAction`, after line 60 (`const questions = ...`), extract timezone from raw:

```ts
const timezone = raw.timezone as string;
```

Then in the `dbCreateEvent` call (line 67-77), add `timezone` to the spread object:

```ts
const event = await dbCreateEvent({
  ...parsed,
  coverImage: parsed.coverImage || null,
  description: parsed.description || null,
  location: parsed.location || null,
  endDate: parsed.endDate || null,
  questions: questions || null,
  timezone,
  inviteCode,
  status: 'open',
  createdBy: session.user.id,
});
```

- [ ] **Step 2: Pass timezone in updateEventAction**

In `app/actions/events.ts`, inside `updateEventAction`, after line 95 (`const questions = ...`), extract timezone:

```ts
const timezone = raw.timezone as string | undefined;
```

Then in the `dbUpdateEvent` call (line 108-116), add timezone:

```ts
const event = await dbUpdateEvent(eventId, {
  ...parsed,
  coverImage: parsed.coverImage || null,
  description: parsed.description || null,
  location: parsed.location || null,
  endDate: parsed.endDate || null,
  ...(questions !== undefined && { questions }),
  ...(inviteCode !== undefined && { inviteCode }),
  ...(timezone && { timezone }),
});
```

- [ ] **Step 3: Verify build compiles**

Run: `pnpm build`

Expected: Build succeeds (no type errors from the new field — it has a default in the schema so it's optional on insert).

- [ ] **Step 4: Commit**

```bash
git add app/actions/events.ts
git commit -m "feat: persist timezone in create and update event actions"
```

---

### Task 3: Make timezone picker functional in event form

**Files:**
- Modify: `components/admin/events/event-form.tsx`

- [ ] **Step 1: Add timezone conversion utility functions**

At the top of `event-form.tsx`, after the imports (before line 40), add these two helper functions:

```ts
/**
 * Convert a Date whose hours/minutes represent wall-clock time in the browser
 * to a UTC ISO string as if those hours/minutes were in `timezone`.
 */
function wallClockToUTC(date: Date, timezone: string): string {
  // Format the same instant in both the target timezone and the browser timezone
  const opts: Intl.DateTimeFormatOptions = {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  };
  const targetParts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { ...opts, timeZone: timezone })
      .formatToParts(date).map(p => [p.type, p.value])
  );
  const browserParts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', opts)
      .formatToParts(date).map(p => [p.type, p.value])
  );

  const targetMs = Date.UTC(
    +targetParts.year, +targetParts.month - 1, +targetParts.day,
    +targetParts.hour, +targetParts.minute, +targetParts.second,
  );
  const browserMs = Date.UTC(
    +browserParts.year, +browserParts.month - 1, +browserParts.day,
    +browserParts.hour, +browserParts.minute, +browserParts.second,
  );

  // offsetDiff = how much further ahead the browser is vs the target timezone
  const offsetDiff = browserMs - targetMs;
  return new Date(date.getTime() + offsetDiff).toISOString();
}

/**
 * Convert a UTC Date to a local Date whose hours/minutes match the wall-clock
 * time in `timezone`. Used when loading an event for editing.
 */
function utcToWallClock(utcDate: Date, timezone: string): Date {
  const opts: Intl.DateTimeFormatOptions = {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  };
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { ...opts, timeZone: timezone })
      .formatToParts(utcDate).map(p => [p.type, p.value])
  );
  return new Date(
    +parts.year, +parts.month - 1, +parts.day,
    +parts.hour, +parts.minute, +parts.second,
  );
}
```

- [ ] **Step 2: Initialize timezone from event on edit**

Replace lines 95-97:

```ts
const [timezone, setTimezone] = useState(
  () => Intl.DateTimeFormat().resolvedOptions().timeZone
);
```

With:

```ts
const [timezone, setTimezone] = useState(
  () => event?.timezone ?? 'America/New_York'
);
```

- [ ] **Step 3: Initialize date pickers with wall-clock time on edit**

Replace lines 72-77:

```ts
const [startDate, setStartDate] = useState<Date | undefined>(
  event?.date ? new Date(event.date) : undefined
);
const [endDate, setEndDate] = useState<Date | undefined>(
  event?.endDate ? new Date(event.endDate) : undefined
);
```

With:

```ts
const [startDate, setStartDate] = useState<Date | undefined>(() => {
  if (!event?.date) return undefined;
  return utcToWallClock(new Date(event.date), event.timezone ?? 'America/New_York');
});
const [endDate, setEndDate] = useState<Date | undefined>(() => {
  if (!event?.endDate) return undefined;
  return utcToWallClock(new Date(event.endDate), event.timezone ?? 'America/New_York');
});
```

- [ ] **Step 4: Send timezone in formData and convert dates on submit**

Replace lines 196-197:

```ts
if (startDate) formData.set("date", startDate.toISOString());
if (endDate) formData.set("endDate", endDate.toISOString());
```

With:

```ts
formData.set("timezone", timezone);
if (startDate) formData.set("date", wallClockToUTC(startDate, timezone));
if (endDate) formData.set("endDate", wallClockToUTC(endDate, timezone));
```

- [ ] **Step 5: Verify the form works**

Run: `pnpm dev`

Manual test:
1. Create a new event — timezone picker should default to `America/New_York`
2. Set time to 7:00 PM, pick timezone `America/Los_Angeles`
3. Save — verify in Drizzle Studio (`pnpm db:studio`) that the stored UTC time is `03:00Z` next day (7 PM PT = 3 AM UTC next day in summer / 2 AM in winter)
4. Edit the event — verify the date picker shows 7:00 PM and timezone shows `America/Los_Angeles`

- [ ] **Step 6: Commit**

```bash
git add components/admin/events/event-form.tsx
git commit -m "feat: make timezone picker functional with correct UTC conversion"
```

---

### Task 4: Create client-side FormattedTime component

**Files:**
- Create: `components/ui/formatted-time.tsx`

- [ ] **Step 1: Create the FormattedTime component**

Create `components/ui/formatted-time.tsx`:

```tsx
'use client';

interface FormattedTimeProps {
  date: Date | string;
  format: 'date' | 'date-short' | 'time' | 'datetime' | 'month-short' | 'day' | 'weekday';
  className?: string;
}

export function FormattedTime({ date, format, className }: FormattedTimeProps) {
  const d = new Date(date);

  let text: string;
  switch (format) {
    case 'date':
      text = d.toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      });
      break;
    case 'date-short':
      text = d.toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      });
      break;
    case 'time':
      text = d.toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit',
      });
      break;
    case 'datetime':
      text = d.toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      }) + ', ' + d.toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit',
      });
      break;
    case 'month-short':
      text = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
      break;
    case 'day':
      text = String(d.getDate());
      break;
    case 'weekday':
      text = d.toLocaleDateString('en-US', { weekday: 'long' });
      break;
  }

  return <span className={className} suppressHydrationWarning>{text}</span>;
}
```

- [ ] **Step 2: Commit**

```bash
git add components/ui/formatted-time.tsx
git commit -m "feat: add FormattedTime client component for browser-local date display"
```

---

### Task 5: Replace server-side date formatting in user event detail page

**Files:**
- Modify: `app/(user)/user/events/[id]/page.tsx`

- [ ] **Step 1: Add FormattedTime import and remove local format functions**

In `app/(user)/user/events/[id]/page.tsx`:

Add import at the top (after line 13):

```ts
import { FormattedTime } from '@/components/ui/formatted-time';
```

Delete lines 15-37 (the four local `formatDate`, `formatTime`, `formatMonthShort`, `formatDay` functions).

- [ ] **Step 2: Replace formatMonthShort and formatDay usage**

Replace lines 154-159 (the date badge):

```tsx
<span className="text-[10px] font-semibold uppercase leading-none text-muted-foreground">
  {formatMonthShort(event.date)}
</span>
<span className="text-lg font-bold leading-tight text-foreground">
  {formatDay(event.date)}
</span>
```

With:

```tsx
<FormattedTime
  date={event.date}
  format="month-short"
  className="text-[10px] font-semibold uppercase leading-none text-muted-foreground"
/>
<FormattedTime
  date={event.date}
  format="day"
  className="text-lg font-bold leading-tight text-foreground"
/>
```

- [ ] **Step 3: Replace formatDate and formatTime usage**

Replace lines 162-165:

```tsx
<p className="font-medium text-foreground">{formatDate(event.date)}</p>
<p className="text-sm">
  {formatTime(event.date)}
  {event.endDate && ` — ${formatTime(event.endDate)}`}
</p>
```

With:

```tsx
<p className="font-medium text-foreground">
  <FormattedTime date={event.date} format="date" />
</p>
<p className="text-sm">
  <FormattedTime date={event.date} format="time" />
  {event.endDate && (
    <>
      {' — '}
      <FormattedTime date={event.endDate} format="time" />
    </>
  )}
</p>
```

- [ ] **Step 4: Verify the page renders**

Run: `pnpm dev`

Navigate to a user event detail page. Verify date and time display in your browser's local timezone.

- [ ] **Step 5: Commit**

```bash
git add 'app/(user)/user/events/[id]/page.tsx'
git commit -m "feat: use FormattedTime in user event detail page for local timezone display"
```

---

### Task 6: Replace server-side date formatting in event card and timeline

**Files:**
- Modify: `components/user/event-card.tsx`
- Modify: `components/user/event-timeline.tsx`

- [ ] **Step 1: Replace formatTime in event-card.tsx**

In `components/user/event-card.tsx`:

Add import at top:

```ts
import { FormattedTime } from '@/components/ui/formatted-time';
```

Delete lines 8-14 (the `formatTime` function).

Replace line 50:

```tsx
{formatTime(event.date)}
```

With:

```tsx
<FormattedTime date={event.date} format="time" />
```

- [ ] **Step 2: Convert event-timeline.tsx to a client component**

In `components/user/event-timeline.tsx`:

Add `'use client';` at the very top (line 1, before the import).

Add import for FormattedTime:

```ts
import { FormattedTime } from '@/components/ui/formatted-time';
```

The `getDateLabel` and `groupEventsByDate` functions can stay as-is — they now run in the browser where `new Date()` and `toLocaleDateString` use the viewer's local timezone. No further changes needed to these functions.

- [ ] **Step 3: Verify timeline and cards render correctly**

Run: `pnpm dev`

Navigate to the user events list page. Verify:
- Timeline date grouping labels (Today, Tomorrow, Apr 10, etc.) are correct for your timezone
- Event card times display in your local timezone

- [ ] **Step 4: Commit**

```bash
git add components/user/event-card.tsx components/user/event-timeline.tsx
git commit -m "feat: use client-side date formatting in event card and timeline"
```

---

### Task 7: Verify full build and end-to-end flow

**Files:** None (verification only)

- [ ] **Step 1: Run production build**

Run: `pnpm build`

Expected: Build succeeds with no errors.

- [ ] **Step 2: Run linter**

Run: `pnpm lint`

Expected: No new lint errors.

- [ ] **Step 3: End-to-end manual test**

Run: `pnpm dev`

Test the following flow:
1. **Admin: Create event** — Set time to 7:00 PM, timezone to `America/New_York`. Save.
2. **Admin: View event** — Verify time shows as 7:00 PM (assuming your browser is in ET).
3. **User: View same event** — Verify time also shows correctly in your browser timezone.
4. **Admin: Edit event** — Verify the date picker shows 7:00 PM and timezone shows `America/New_York`.
5. **Admin: Change timezone** — Change to `America/Los_Angeles`, keep 7:00 PM. Save. Verify stored UTC changed.
6. **User: View event** — Verify time shifted (should show 10:00 PM if viewer is in ET).

- [ ] **Step 4: Commit all remaining changes (if any)**

```bash
git add -A
git commit -m "chore: verify timezone fix end-to-end"
```
