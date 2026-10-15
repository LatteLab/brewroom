# Registration Page Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the user event detail page to add a private event badge, larger date/location icons, and a registration container with user info — matching the reference screenshot.

**Architecture:** Modify two existing files in-place. The server component page (`page.tsx`) gets layout changes and passes user session data down. The client component (`event-registration-button.tsx`) accepts a new `user` prop to render profile info and updates button labels.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS v4, shadcn/ui, Lucide icons

---

### Task 1: Add Private Event Badge

**Files:**
- Modify: `app/(user)/user/events/[id]/page.tsx:81-84`

**Step 1: Add the badge above the event title**

In `page.tsx`, inside the right column `<div className="space-y-6">`, add a private event badge before the `<h1>`:

```tsx
{event.visibility === 'private' && (
  <div className="flex items-center gap-1.5 text-sm font-medium text-pink-600">
    <Lock className="h-3.5 w-3.5" />
    <span>Private Event</span>
  </div>
)}

<h1 className="text-3xl font-bold tracking-tight md:text-4xl">
  {event.name}
</h1>
```

Add `Lock` to the lucide-react import at the top of the file:

```tsx
import { Calendar, MapPin, Users, Lock } from 'lucide-react';
```

**Step 2: Verify build**

Run: `cd /Users/datct/CSProjects/WorkProjects/latte-lab/latte-lab-frontend && pnpm build`
Expected: Build succeeds with no type errors

**Step 3: Commit**

```bash
git add app/\(user\)/user/events/\[id\]/page.tsx
git commit -m "feat: add private event badge to event detail page"
```

---

### Task 2: Replace Calendar Icon with Date Block

**Files:**
- Modify: `app/(user)/user/events/[id]/page.tsx:86-96`

**Step 1: Add month/day format helpers**

Add these helper functions near the existing `formatDate` and `formatTime` functions at the top of the file:

```tsx
function formatMonthShort(date: Date) {
  return new Date(date).toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
}

function formatDay(date: Date) {
  return new Date(date).getDate();
}
```

**Step 2: Replace the calendar row**

Replace the current calendar icon + text block (the first `<div className="flex items-center gap-3 text-muted-foreground">` containing the Calendar icon) with:

```tsx
<div className="flex items-center gap-3 text-muted-foreground">
  <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg border bg-muted/50">
    <span className="text-[10px] font-semibold uppercase leading-none text-muted-foreground">
      {formatMonthShort(event.date)}
    </span>
    <span className="text-lg font-bold leading-tight text-foreground">
      {formatDay(event.date)}
    </span>
  </div>
  <div>
    <p className="font-medium text-foreground">{formatDate(event.date)}</p>
    <p className="text-sm">
      {formatTime(event.date)}
      {event.endDate && ` — ${formatTime(event.endDate)}`}
    </p>
  </div>
</div>
```

Remove `Calendar` from the lucide-react import since we no longer use the Calendar icon here. Note: Calendar is still used in the fallback cover image — check if it's still needed. If so, keep the import.

**Step 3: Verify build**

Run: `cd /Users/datct/CSProjects/WorkProjects/latte-lab/latte-lab-frontend && pnpm build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add app/\(user\)/user/events/\[id\]/page.tsx
git commit -m "feat: replace calendar icon with styled date block"
```

---

### Task 3: Enlarge Location Icon

**Files:**
- Modify: `app/(user)/user/events/[id]/page.tsx:98-103`

**Step 1: Increase MapPin size and add "Register to See Address" for private events**

Replace the location section with:

```tsx
<div className="flex items-center gap-3 text-muted-foreground">
  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border bg-muted/50">
    <MapPin className="h-5 w-5 text-muted-foreground" />
  </div>
  <p className="font-medium text-foreground">
    {event.location
      ? event.location
      : event.visibility === 'private'
        ? 'Register to See Address'
        : 'No location specified'}
  </p>
</div>
```

Note: Always render this section now (remove the `{event.location && ...}` conditional) so that private events without a location show the "Register to See Address" text.

**Step 2: Verify build**

Run: `cd /Users/datct/CSProjects/WorkProjects/latte-lab/latte-lab-frontend && pnpm build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add app/\(user\)/user/events/\[id\]/page.tsx
git commit -m "feat: enlarge location icon with styled container"
```

---

### Task 4: Build the Registration Container in `page.tsx`

**Files:**
- Modify: `app/(user)/user/events/[id]/page.tsx:116-121`

**Step 1: Wrap the registration button in a bordered container**

Replace the current registration button section with a registration container that includes a header, optional approval notice, welcome message, user info, and the button. Add `ShieldCheck` to the lucide-react import.

```tsx
import { MapPin, Users, Lock, ShieldCheck } from 'lucide-react';
```

```tsx
{/* Registration container */}
<div className="rounded-xl border p-5 space-y-4">
  <p className="text-sm font-medium text-muted-foreground">Registration</p>

  {event.requireApproval && (
    <div className="flex items-start gap-2.5">
      <ShieldCheck className="h-5 w-5 shrink-0 text-muted-foreground mt-0.5" />
      <div>
        <p className="text-sm font-semibold">Approval Required</p>
        <p className="text-xs text-muted-foreground">Your registration is subject to host approval.</p>
      </div>
    </div>
  )}

  <p className="text-sm text-muted-foreground">
    Welcome! To join the event, please register below.
  </p>

  <div className="flex items-center gap-2.5">
    <Avatar className="h-8 w-8">
      <AvatarImage src={session.user.image || undefined} />
      <AvatarFallback className="text-xs">
        {session.user.name?.split(' ').map((n: string) => n[0]).join('') || '?'}
      </AvatarFallback>
    </Avatar>
    <div className="text-sm">
      <span className="font-medium">{session.user.name}</span>{' '}
      <span className="text-muted-foreground">{session.user.email}</span>
    </div>
  </div>

  <EventRegistrationButton
    event={event}
    registration={registration}
    spotsRemaining={spotsRemaining}
  />
</div>
```

**Step 2: Verify build**

Run: `cd /Users/datct/CSProjects/WorkProjects/latte-lab/latte-lab-frontend && pnpm build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add app/\(user\)/user/events/\[id\]/page.tsx
git commit -m "feat: add registration container with user info and approval notice"
```

---

### Task 5: Update Button Label for Approval Events

**Files:**
- Modify: `components/user/event-registration-button.tsx:100-111`

**Step 1: Change "Request Access" to "One-Click Apply" for approval events**

In `event-registration-button.tsx`, find the `requireApproval` section and change the button text:

```tsx
// Require approval — show "One-Click Apply"
if (event.requireApproval) {
  return (
    <Button
      size="lg"
      className="w-full rounded-xl text-lg"
      disabled={isPending}
      onClick={handleRegister}
    >
      {isPending ? 'Applying...' : 'One-Click Apply'}
    </Button>
  );
}
```

Also update the toast message in `handleRegister` from "Access requested!" to "Application submitted!" for consistency:

```tsx
if (event.requireApproval) {
  toast.success('Application submitted! Waiting for approval.');
}
```

**Step 2: Verify build**

Run: `cd /Users/datct/CSProjects/WorkProjects/latte-lab/latte-lab-frontend && pnpm build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add components/user/event-registration-button.tsx
git commit -m "feat: update approval button label to One-Click Apply"
```

---

### Task 6: Update Mobile Sticky CTA

**Files:**
- Modify: `app/(user)/user/events/[id]/page.tsx:158-165`

**Step 1: Update the mobile sticky CTA to match**

The mobile sticky CTA at the bottom should just show the button (no full registration container since it would take too much space on mobile). Keep it as-is — no changes needed unless the button label change from Task 5 doesn't propagate (it will, since it's the same component).

Verify the mobile sticky CTA still works properly by confirming the `EventRegistrationButton` at the bottom of the page uses the same props.

**Step 2: Final full build verification**

Run: `cd /Users/datct/CSProjects/WorkProjects/latte-lab/latte-lab-frontend && pnpm build`
Expected: Build succeeds with no errors

**Step 3: Commit (if any changes were needed)**

Only commit if changes were made to the mobile CTA section.
