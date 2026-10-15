# Event Creation Page Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the admin event creation/edit page to match Luma's UI with gradient cover images, Tiptap rich text editor, proper date/time pickers, and a responsive two-column layout.

**Architecture:** Rewrite `EventForm` as a Luma-style two-column layout (image left, form right) that stacks on mobile. New components for cover image picker (CSS gradients + Supabase Storage uploads), Tiptap editor, and date/time pickers with timezone display. Existing server actions and schema remain unchanged.

**Tech Stack:** Next.js 16, Tiptap, Supabase Storage, shadcn/ui (Calendar, Popover), Tailwind CSS v4, date-fns.

**Design doc:** `docs/plans/2026-02-17-event-creation-redesign.md`

---

### Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install Tiptap packages**

Run:
```bash
pnpm add @tiptap/react @tiptap/starter-kit @tiptap/extension-link @tiptap/extension-placeholder @tiptap/pm date-fns
```

**Step 2: Add shadcn Calendar and Popover components**

Run:
```bash
pnpm dlx shadcn@latest add calendar popover
```

This adds `components/ui/calendar.tsx`, `components/ui/popover.tsx`, and installs `react-day-picker` + `@radix-ui/react-popover`.

**Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml components/ui/calendar.tsx components/ui/popover.tsx
git commit -m "chore: add tiptap, date-fns, and shadcn calendar/popover"
```

---

### Task 2: Set Up Supabase Client + Storage Bucket

**Files:**
- Modify: `.env.local` (add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
- Create: `lib/supabase/client.ts`

The project ref from DATABASE_URL is `rlmgbbqyokizudzhfydp`.

**Step 1: Add Supabase env vars to `.env.local`**

Add these lines:
```
# Supabase (for Storage uploads)
NEXT_PUBLIC_SUPABASE_URL=https://rlmgbbqyokizudzhfydp.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<get from Supabase dashboard → Settings → API → anon/public key>
```

The anon key must be retrieved from the Supabase dashboard. Check `Settings > API > Project API keys > anon public`.

**Step 2: Create browser Supabase client**

Create `lib/supabase/client.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

**Step 3: Create `event-covers` storage bucket**

Using Supabase MCP or dashboard, create a public bucket named `event-covers` with:
- Public access: true (images need to be publicly readable)
- File size limit: 5MB
- Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`, `image/gif`

**Step 4: Commit**

```bash
git add lib/supabase/client.ts
git commit -m "feat: add Supabase browser client for storage uploads"
```

Note: `.env.local` is gitignored — do not commit it.

---

### Task 3: Create Gradient Utilities

**Files:**
- Create: `lib/gradients.ts`

**Step 1: Implement gradient generation and parsing**

Create `lib/gradients.ts` with:

- `generateGradientConfig()` — returns a random gradient config object with 3-4 warm color stops, angle, and a unique seed
- `gradientConfigToCSS(config)` — converts config to a CSS `linear-gradient` or `radial-gradient` string
- `serializeGradient(config)` — returns `gradient:<json>` string for DB storage
- `parseGradient(value)` — parses `gradient:<json>` string back to config, returns null if it's a URL
- `isGradient(value)` — type guard checking if a string starts with `gradient:`

Gradient style: use warm/cool mesh-like linear gradients with 3-4 color stops from a curated palette (soft pinks, lavenders, teals, peaches, sky blues — similar to Luma's aesthetic).

**Step 2: Commit**

```bash
git add lib/gradients.ts
git commit -m "feat: add gradient generation utilities for event covers"
```

---

### Task 4: Create Supabase Storage Upload Helper

**Files:**
- Create: `lib/supabase/storage.ts`

**Step 1: Implement upload helper**

Create `lib/supabase/storage.ts` with:

- `uploadEventCover(file: File)` — uploads file to `event-covers` bucket with a unique filename (UUID), returns the public URL
- `deleteEventCover(url: string)` — extracts the file path from URL and deletes from storage (for cleanup on re-upload)

Use `supabase.storage.from('event-covers').upload(...)` and `.getPublicUrl(...)`.

Generate unique filenames: `${crypto.randomUUID()}.${extension}`.

**Step 2: Commit**

```bash
git add lib/supabase/storage.ts
git commit -m "feat: add Supabase storage upload helper for event covers"
```

---

### Task 5: Create CoverImagePicker Component

**Files:**
- Create: `components/admin/cover-image-picker.tsx`

**Step 1: Build the cover image picker**

Create `components/admin/cover-image-picker.tsx` — a `'use client'` component that:

**Props:**
- `value: string | null` — current coverImage value (gradient string, URL, or null)
- `onChange: (value: string) => void` — callback when image changes

**Behavior:**
- On mount with no value: auto-generates a random gradient and calls `onChange` with the serialized gradient
- Displays the current image: if gradient string → render as CSS background, if URL → render as `<img>`
- **Shuffle button** (small, bottom-left): regenerates a new random gradient
- **Upload button** (camera icon, bottom-right like Luma): hidden file input, accepts `image/*`
- On file select: uploads to Supabase Storage via the helper, calls `onChange` with the returned URL
- Shows a loading spinner overlay during upload
- Square aspect ratio on desktop, aspect-[4/3] on mobile, rounded-2xl, overflow-hidden

**Step 2: Commit**

```bash
git add components/admin/cover-image-picker.tsx
git commit -m "feat: add CoverImagePicker with gradient generation and upload"
```

---

### Task 6: Create Tiptap Editor Component

**Files:**
- Create: `components/admin/tiptap-editor.tsx`

**Step 1: Build the Tiptap editor wrapper**

Create `components/admin/tiptap-editor.tsx` — a `'use client'` component:

**Props:**
- `content: string` — initial HTML content
- `onChange: (html: string) => void` — callback on content change
- `placeholder?: string` — placeholder text (default: "Add Description")

**Setup:**
- Use `@tiptap/starter-kit` (includes bold, italic, headings, lists, etc.)
- Add `@tiptap/extension-link` for link support
- Add `@tiptap/extension-placeholder` for placeholder text

**Toolbar:** Minimal floating/sticky toolbar above the editor with icon buttons:
- Bold (B), Italic (I), Bullet List, Ordered List, Link

**Styling:**
- Editor area: minimal border (border-muted, rounded-lg), padding, min-height ~150px
- Toolbar: small icon buttons with muted styling, active state highlighted
- Prose styling for the content area (proper spacing for paragraphs, lists, links)
- Use Tailwind's `prose` class or manual styling for rendered content

**Step 2: Commit**

```bash
git add components/admin/tiptap-editor.tsx
git commit -m "feat: add Tiptap rich text editor component"
```

---

### Task 7: Create DateTimePicker Component

**Files:**
- Create: `components/admin/date-time-picker.tsx`

**Step 1: Build the date-time picker**

Create `components/admin/date-time-picker.tsx` — a `'use client'` component:

**Props:**
- `value: Date | undefined`
- `onChange: (date: Date | undefined) => void`
- `label: string` — e.g. "Start" or "End"

**Layout (matching Luma screenshot):**
```
[label]     [Date Button]    [Time Select]
```

- **Date button**: Shows formatted date (e.g. "Tue, Feb 17"). Clicking opens a Popover with shadcn Calendar.
- **Time select**: Shows time (e.g. "05:30 PM"). Use a Select dropdown with 15-minute increments from 12:00 AM to 11:45 PM.
- When date is selected from calendar, preserve the existing time portion.
- When time is selected, preserve the existing date portion.

Use `date-fns` for formatting: `format(date, "EEE, MMM d")` for date display, and `format(date, "hh:mm a")` for time.

**Step 2: Create a TimezoneDisplay component**

Either in the same file or inline in the form — shows:
```
🌐 GMT-05:00
   New York
```

Auto-detect timezone using `Intl.DateTimeFormat().resolvedOptions().timeZone`. Format offset from `new Date().getTimezoneOffset()`.

**Step 3: Commit**

```bash
git add components/admin/date-time-picker.tsx
git commit -m "feat: add Luma-style date-time picker with calendar popover"
```

---

### Task 8: Update Validation Schema

**Files:**
- Modify: `lib/validations/events.ts`

**Step 1: Update coverImage validation**

Change the `coverImage` validation from `.url().optional().or(z.literal(''))` to accept either a URL or a gradient string:

```typescript
coverImage: z.string().optional().or(z.literal('')),
```

Remove the `.url()` restriction since the field can now hold `gradient:{...}` strings.

The description field is already `z.string().optional()` — no change needed (HTML is still a string).

**Step 2: Commit**

```bash
git add lib/validations/events.ts
git commit -m "feat: update event validation to accept gradient cover images"
```

---

### Task 9: Rewrite EventForm Component

**Files:**
- Modify: `components/admin/event-form.tsx` (full rewrite)

This is the main task. Rewrite the entire `EventForm` component with the Luma-style layout.

**Step 1: Implement the new EventForm**

The new form uses controlled state (not native FormData) since we have interactive components (Tiptap, CoverImagePicker, DateTimePicker) that don't use native form inputs.

**State:**
- `coverImage: string` — gradient string or URL
- `name: string`
- `startDate: Date | undefined`
- `endDate: Date | undefined`
- `location: string`
- `description: string` — HTML from Tiptap
- `eventType: 'waitlist' | 'lottery'`
- `capacity: number | ''`
- `lotteryDeadline: Date | undefined`
- `status: 'draft' | 'open'`

**Layout structure:**
```
<form>
  <div className="grid gap-8 md:grid-cols-[420px_1fr]">
    {/* Left: Cover Image */}
    <CoverImagePicker value={coverImage} onChange={setCoverImage} />

    {/* Right: Form Fields */}
    <div className="space-y-6">
      {/* Event Name — large borderless input */}
      <input ... className="text-3xl font-bold ..." placeholder="Event Name" />

      {/* Date/Time Section */}
      <div className="rounded-xl border bg-muted/30 p-4">
        <div className="flex gap-4">
          <div className="flex-1 space-y-3">
            <DateTimePicker label="Start" value={startDate} onChange={setStartDate} />
            <DateTimePicker label="End" value={endDate} onChange={setEndDate} />
          </div>
          <TimezoneDisplay />
        </div>
      </div>

      {/* Location */}
      <div className="rounded-xl border bg-muted/30 p-4 flex items-center gap-3">
        <MapPin icon />
        <input placeholder="Add Event Location" />
      </div>

      {/* Description — Tiptap */}
      <div className="rounded-xl border bg-muted/30 p-4 flex items-start gap-3">
        <FileText icon />
        <TiptapEditor content={description} onChange={setDescription} />
      </div>

      {/* Event Options */}
      <div>
        <h3>Event Options</h3>
        <div className="rounded-xl border divide-y">
          {/* Event Type row */}
          {/* Capacity row */}
          {/* Lottery Deadline row (conditional) */}
          {/* Status row */}
        </div>
      </div>

      {/* Submit Button */}
      <Button className="w-full rounded-xl" size="lg">
        Create Event
      </Button>
    </div>
  </div>
</form>
```

**On submit:** Build a FormData object from the controlled state, then call the existing `createEventAction` / `updateEventAction` server actions.

**Edit mode:** When `event` prop is passed, initialize all state from the event object. Parse gradient from `event.coverImage` if it's a gradient string.

**Step 2: Commit**

```bash
git add components/admin/event-form.tsx
git commit -m "feat: rewrite EventForm with Luma-style two-column layout"
```

---

### Task 10: Update Event Creation Page

**Files:**
- Modify: `app/(admin)/admin/events/new/page.tsx`

**Step 1: Simplify the page**

Remove the `PageHeader` component. The form itself is the full page content:

```typescript
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { EventForm } from '@/components/admin/event-form';

export default async function NewEventPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (!session.user.isAdmin) redirect('/user');

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <EventForm />
      </div>
    </div>
  );
}
```

**Step 2: Verify the edit page still works**

The edit page at `app/(admin)/admin/events/[id]/page.tsx` passes `<EventForm event={event} />` inside a tab. This should still work since EventForm accepts the same `event` prop. Verify it renders correctly.

**Step 3: Commit**

```bash
git add app/(admin)/admin/events/new/page.tsx
git commit -m "feat: simplify event creation page layout"
```

---

### Task 11: Update Server Action (if needed)

**Files:**
- Modify: `app/actions/events.ts`

**Step 1: Review and adjust server action**

The current `createEventAction` uses `Object.fromEntries(formData)` to parse. Since we're now building FormData from controlled state in the form, this should still work. However, verify:

- `description` field now contains HTML — the action stores it as-is in the `description` text column, which is correct.
- `coverImage` field may contain a `gradient:...` string — the action stores it as-is in the `coverImage` text column, which is correct.

If the FormData approach still works cleanly, no changes needed. If we switch to passing a JSON object instead, update the action signature accordingly.

**Step 2: Commit (only if changes were made)**

```bash
git add app/actions/events.ts
git commit -m "feat: update event action to handle rich text and gradient covers"
```

---

### Task 12: Visual QA & Polish

**Step 1: Run dev server and test**

```bash
pnpm dev
```

Navigate to `/admin/events/new` and verify:
- Two-column layout renders correctly on desktop
- Single-column stack on mobile (resize browser)
- Random gradient appears on load
- Shuffle button generates new gradient
- Image upload works (uploads to Supabase, shows preview)
- Date/time pickers open and select correctly
- Timezone displays correctly
- Tiptap editor works (bold, italic, lists, links)
- Event type select works, lottery deadline shows/hides
- Form submission creates event successfully
- Edit mode pre-fills all fields correctly

**Step 2: Fix any visual issues**

Adjust spacing, colors, border-radius, font sizes to match the Luma reference as closely as possible.

**Step 3: Final commit**

```bash
git add -A
git commit -m "fix: polish event creation page visual details"
```
