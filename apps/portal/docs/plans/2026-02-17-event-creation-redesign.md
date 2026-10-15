# Event Creation Page Redesign

**Date:** 2026-02-17
**Status:** Approved

## Overview

Redesign the admin event creation/edit page to match Luma's event creation UI. Key changes: two-column layout, random gradient cover images with upload support, Tiptap rich text editor for descriptions, improved date/time pickers with timezone display, and card-based event options.

## Decisions

- **Image storage**: Supabase Storage (`event-covers` bucket)
- **Rich text editor**: Tiptap (stores HTML in existing `description` text column)
- **Gradient images**: CSS gradient with seed stored as `gradient:<json>` in `coverImage` field
- **Layout**: Luma two-column on desktop, single-column stack on mobile

## Layout

**Desktop (md+):** `grid-cols-[420px_1fr]` gap-8, max-w-5xl mx-auto

- Left column: Cover image area (square, rounded-2xl)
- Right column: Event name, date/time, location, description, event options, submit button

**Mobile (<md):** Single column stack

- Cover image first (full-width, aspect-[4/3])
- All form fields below

No PageHeader — the form itself is the page content, matching Luma's clean approach.

## Cover Image Area

- **Default**: Random CSS mesh gradient (3-4 color stops, warm palette)
- **Storage format**: `gradient:<json-config>` in `coverImage` column when using generated gradient, or a Supabase Storage URL when user uploads
- **Shuffle button**: Regenerates a new random gradient
- **Upload button**: Camera icon overlay (bottom-right), opens file picker
- **Upload flow**: File → Supabase Storage `event-covers` bucket → URL replaces gradient in form state
- **Preview**: Always shows current image or gradient

## Date/Time Pickers

Replace native `datetime-local` inputs with shadcn-style components:

- **Start row**: "Start" label | Date popover (calendar) | Time select (HH:MM AM/PM)
- **End row**: "End" label | Date popover | Time select
- **Timezone**: Globe icon + auto-detected timezone (e.g. "GMT-05:00 New York") displayed to the right
- **Layout**: Matches Luma — `Start [Tue, Feb 17] [05:30 PM]` with connected timeline dots between Start/End

New shadcn components needed: Calendar, Popover.

## Rich Text Description (Tiptap)

- Tiptap editor with minimal toolbar: Bold, Italic, Bullet list, Ordered list, Link
- Placeholder: "Add Description"
- Content stored as HTML string in existing `description` text column (no schema change)
- Borderless style matching the form aesthetic (visible border on focus only)
- On submit: serialize Tiptap HTML into FormData

## Event Options

Card-based horizontal rows within a rounded container:

| Row | Left | Right |
|-----|------|-------|
| Event Type | Icon + "Event Type" | Select dropdown (Waitlist / Lottery) |
| Capacity | Icon + "Capacity" | Number input |
| Lottery Deadline | Icon + "Lottery Deadline" | Date/time picker (conditional, shown when type=lottery) |
| Status | Icon + "Status" | Draft / Published toggle |

## Form Submission

- Full-width "Create Event" button (primary/teal, rounded-xl, large padding)
- Edit mode: "Update Event"
- Loading: spinner + "Saving..."
- Server action unchanged — just need to handle HTML description and gradient/URL cover image

## New Dependencies

- `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-link`, `@tiptap/extension-placeholder`
- `@supabase/supabase-js` (already installed)
- shadcn/ui: `calendar`, `popover` (to be added via CLI)

## Files to Create/Modify

- `components/admin/event-form.tsx` — full rewrite
- `components/admin/cover-image-picker.tsx` — new: gradient + upload logic
- `components/admin/tiptap-editor.tsx` — new: Tiptap wrapper
- `components/admin/date-time-picker.tsx` — new: date popover + time select
- `lib/gradients.ts` — new: gradient generation/parsing utilities
- `lib/supabase-storage.ts` — new: upload helper for event covers
- `lib/validations/events.ts` — update coverImage validation to accept gradient strings
- `app/actions/events.ts` — minor update to handle HTML description
- `app/(admin)/admin/events/new/page.tsx` — remove PageHeader, simplify wrapper

## Schema Impact

None — `coverImage` (text) and `description` (text) columns are unchanged. The `coverImage` field now stores either a URL or a `gradient:<json>` string.
