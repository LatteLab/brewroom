# Event Timezone Fix — Design Spec

## Problem

Event times display differently on admin vs user sides due to two compounding bugs:

1. **Storage bug:** The admin event form has a timezone picker, but the selected timezone is never sent to the server or stored. Dates are saved as `startDate.toISOString()`, which converts from the admin's browser timezone to UTC — ignoring the picker selection entirely.

2. **Display bug:** Admin components are `'use client'` (dates format in the browser's local timezone). User components are server components (dates format in Node.js server timezone — UTC on Vercel). This causes a 4-5 hour offset for ET users on the user portal.

## Decisions

- Default timezone: `America/New_York` (MIT campus)
- Timezone picker remains available for off-timezone events
- Existing events backfilled as `America/New_York`
- Display in viewer's local timezone (not event timezone) — a 7 PM ET event shows as 4 PM for someone in PT
- No new dependencies — use native `Intl.DateTimeFormat` for timezone offset math

## Design

### 1. Schema & Storage

**`lib/db/schema.ts`** — Add column to `events` table:

```ts
timezone: text('timezone').notNull().default('America/New_York'),
```

**`lib/validations/events.ts`** — Add to Zod schema:

```ts
timezone: z.string().min(1, 'Timezone is required'),
```

**`app/actions/events.ts`** — Read timezone from formData and persist:

```ts
const timezone = formData.get("timezone") as string;
// include in insert/update
```

**Backfill migration** (run via Supabase):

```sql
UPDATE events SET timezone = 'America/New_York' WHERE timezone IS NULL;
```

### 2. Correct Date Saving in Admin Form

**`components/admin/events/event-form.tsx`:**

- Add `formData.set("timezone", timezone)` to the submit handler (after line 195)
- When editing, initialize timezone from `event.timezone` instead of browser timezone:
  ```ts
  const [timezone, setTimezone] = useState(
    () => event?.timezone ?? 'America/New_York'
  );
  ```
- Convert wall-clock time through the selected timezone before `.toISOString()`. The date picker produces a Date with hours/minutes set in the browser's local timezone. At submit, we need to reinterpret those hours/minutes as being in the selected timezone and convert to UTC.

**Timezone conversion approach** (no dependencies):

Use `Intl.DateTimeFormat` to find the UTC offset of the selected timezone, then adjust:

```ts
function wallClockToUTC(date: Date, timezone: string): string {
  // Get the offset of the target timezone at this moment
  const targetFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const browserFormatter = new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });

  // Parse the parts to find the offset difference
  const targetParts = Object.fromEntries(
    targetFormatter.formatToParts(date).map(p => [p.type, p.value])
  );
  const browserParts = Object.fromEntries(
    browserFormatter.formatToParts(date).map(p => [p.type, p.value])
  );

  // Build dates from parts to compute offset difference
  const targetDate = new Date(
    `${targetParts.year}-${targetParts.month}-${targetParts.day}T${targetParts.hour}:${targetParts.minute}:${targetParts.second}Z`
  );
  const browserDate = new Date(
    `${browserParts.year}-${browserParts.month}-${browserParts.day}T${browserParts.hour}:${browserParts.minute}:${browserParts.second}Z`
  );

  // Offset difference in ms between browser timezone and target timezone
  const offsetDiff = browserDate.getTime() - targetDate.getTime();

  // Adjust: the admin entered wall-clock time thinking it's in `timezone`,
  // but the Date object has it in browser timezone. Shift by the difference.
  const adjusted = new Date(date.getTime() + offsetDiff);
  return adjusted.toISOString();
}
```

This reinterprets the browser-local Date as if it were in the selected timezone.

**On edit — initialize date picker with correct wall-clock time:**

When loading an existing event for editing, the stored UTC date needs to be converted to the event's timezone to show the correct wall-clock hours/minutes in the date picker. Reverse of the above: UTC → event timezone wall-clock.

```ts
function utcToWallClock(utcDate: Date, timezone: string): Date {
  // Format the UTC date in the target timezone to get wall-clock parts
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(utcDate).map(p => [p.type, p.value])
  );

  // Create a local Date with those wall-clock values
  // (the date picker expects hours/minutes in browser-local terms,
  //  but we set them as if they're the target timezone's wall-clock)
  const result = new Date(
    parseInt(parts.year),
    parseInt(parts.month) - 1,
    parseInt(parts.day),
    parseInt(parts.hour),
    parseInt(parts.minute),
    parseInt(parts.second)
  );
  return result;
}
```

### 3. Client-Side Date Display Component

**Create `components/ui/formatted-time.tsx`:**

A `'use client'` component that formats dates in the viewer's browser timezone.

```tsx
'use client';

interface FormattedTimeProps {
  date: Date | string;
  format: 'date' | 'time' | 'datetime' | 'month-short' | 'day' | 'date-short';
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
        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
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
  }

  return <span className={className} suppressHydrationWarning>{text}</span>;
}
```

**Replace server-side formatting in these files:**

| File | What to replace |
|------|----------------|
| `app/(user)/user/events/[id]/page.tsx` | `formatDate()`, `formatTime()`, `formatMonthShort()`, `formatDay()` — replace with `<FormattedTime>` |
| `components/user/event-card.tsx` | `formatTime()` — replace with `<FormattedTime>` |
| `components/user/event-timeline.tsx` | `getDateLabel()` and `groupEventsByDate()` date formatting — extract into a client component or use `<FormattedTime>` for display labels |

**Admin components — no changes needed:**

These are already `'use client'` and format in the browser:
- `components/admin/events/event-overview.tsx`
- `components/admin/events/admin-event-list.tsx`
- `components/admin/events/checkin-list.tsx`
- `components/admin/events/guest-detail-sheet.tsx`
- `components/admin/events/send-invite-button.tsx`
- `components/admin/events/event-history.tsx`

### 4. Edge Cases

**Hydration mismatch:** Server renders in UTC, client re-renders in viewer's timezone. `suppressHydrationWarning` on `<FormattedTime>` prevents React warnings. The brief flash of UTC → local time is acceptable for small date text.

**Timeline grouping (`event-timeline.tsx`):** `groupEventsByDate()` groups events by date key using `getFullYear()`/`getMonth()`/`getDate()`. On the server these extract UTC date parts, which can put a late-night ET event on the wrong day. Convert `event-timeline.tsx` to a `'use client'` component so that both grouping and label formatting run in the browser. The parent page passes serialized event data; the timeline handles grouping and display client-side.

**Timezone on edit:** Initialize `timezone` state from `event.timezone` (not browser). Initialize date pickers using `utcToWallClock(event.date, event.timezone)` so the admin sees the correct wall-clock time for that timezone.

**No new dependencies:** All timezone math uses native `Intl.DateTimeFormat`. No `date-fns-tz` needed.

## Files Changed

| File | Change |
|------|--------|
| `lib/db/schema.ts` | Add `timezone` column to `events` |
| `lib/validations/events.ts` | Add `timezone` to Zod schema |
| `app/actions/events.ts` | Read and persist `timezone` from formData |
| `components/admin/events/event-form.tsx` | Send timezone in formData, use it for date conversion, init from `event.timezone` on edit |
| `components/ui/formatted-time.tsx` | **New** — client-side date display component |
| `app/(user)/user/events/[id]/page.tsx` | Replace `formatDate`/`formatTime`/etc with `<FormattedTime>` |
| `components/user/event-card.tsx` | Replace `formatTime` with `<FormattedTime>` |
| `components/user/event-timeline.tsx` | Move date grouping/formatting client-side |
| Supabase migration | Backfill `timezone = 'America/New_York'` for existing events |
