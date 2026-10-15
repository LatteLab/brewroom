# Event Management Revamp Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Revamp the admin event detail page from a 2-tab layout (Registrations + Edit) into a Luma-inspired 3-tab experience (Overview, Guests, More) with a revamped check-in page.

**Architecture:** Tab-based single page at `/admin/events/[id]` with 3 client-side tabs. The parent page is a server component that fetches event + registrations and passes data to client tab components. Check-in stays as a separate route. New `deleteEventAction` server action. Guest list refactored from existing registrations table with filtering/sorting added.

**Tech Stack:** Next.js 16 (App Router), TypeScript, shadcn/ui (Tabs, Sheet, Select, Badge, Avatar, Button, Progress, Dialog), Tailwind CSS v4, Drizzle ORM, Sonner toasts.

**Design doc:** `docs/plans/2026-02-22-event-management-revamp-design.md`

**Note:** This project has no test framework set up. Verification is via `pnpm build` (catches TypeScript/import errors) and manual testing with `pnpm dev`.

---

## Task 1: Add `deleteEventAction` server action

**Files:**
- Modify: `latte-lab-frontend/lib/db/event-queries.ts` (add `deleteEvent` query)
- Modify: `latte-lab-frontend/app/actions/events.ts` (add `deleteEventAction`)

**Step 1: Add `deleteEvent` query to event-queries.ts**

Add this function after the `updateEvent` function (~line 58):

```typescript
export async function deleteEvent(id: string) {
  // event_registrations, event_access, lottery_history all have onDelete: cascade
  // so deleting the event cascades to all related rows
  await db.delete(events).where(eq(events.id, id));
}
```

**Step 2: Add `deleteEventAction` to events.ts**

Add this import to the import block at the top of `app/actions/events.ts`:

```typescript
import {
  // ... existing imports ...
  deleteEvent as dbDeleteEvent,
} from '@/lib/db/event-queries';
import { redirect } from 'next/navigation';
```

Then add this function at the end of the file:

```typescript
export async function deleteEventAction(eventId: string) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const event = await getEventById(eventId);
  if (!event) throw new Error('Event not found');

  await dbDeleteEvent(eventId);

  revalidatePath('/admin/events');
  revalidatePath('/user/events');
  redirect('/admin/events');
}
```

Note: Cover image cleanup from Supabase Storage is skipped here — the `deleteEventCover` helper is client-side only. Orphaned storage files can be cleaned up separately if needed.

**Step 3: Verify build**

Run: `cd /Users/datct/CSProjects/WorkProjects/latte-lab/latte-lab-frontend && pnpm build`
Expected: Build succeeds with no type errors.

**Step 4: Commit**

```bash
git add app/actions/events.ts lib/db/event-queries.ts
git commit -m "feat: add deleteEventAction server action"
```

---

## Task 2: Create `event-overview.tsx` (Overview tab)

**Files:**
- Create: `latte-lab-frontend/components/admin/event-overview.tsx`

**Context:**
- Uses existing `EventForm` in a `Sheet` (side panel) for editing
- Shows event preview (cover image, name, date, location, description)
- Shows At-a-Glance stats with progress bar
- Shows Recent Registrations (~5 most recent) with approve/decline for pending
- "All Guests →" button calls `onSwitchToGuests` callback
- "Edit Event" opens Sheet with EventForm
- "Event Page" links to `/user/events/[id]`
- "Share" copies invite URL (private) or public event URL

**Step 1: Create the component**

Create `components/admin/event-overview.tsx`:

```typescript
'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { EventForm } from '@/components/admin/event-form';
import { approveRegistration, denyRegistration } from '@/app/actions/events';
import { parseGradient, gradientConfigToCSS } from '@/lib/gradients';
import { toast } from 'sonner';
import {
  ExternalLink,
  Pencil,
  Copy,
  Check,
  MapPin,
  Calendar,
  Clock,
} from 'lucide-react';
import Link from 'next/link';
import type { Event } from '@/lib/db/schema';

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
  selected: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  rejected: 'bg-red-500/10 text-red-500 border-red-500/20',
  checked_in: 'bg-green-500/10 text-green-700 border-green-500/20',
  no_show: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
  pending_approval: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
};

export function EventOverview({
  event,
  registrations,
  onSwitchToGuests,
}: {
  event: Event;
  registrations: Registration[];
  onSwitchToGuests: () => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  const goingStatuses = ['registered', 'selected', 'checked_in'];
  const goingCount = registrations.filter(r => goingStatuses.includes(r.registration.status)).length;
  const pendingCount = registrations.filter(r => r.registration.status === 'pending_approval').length;
  const percent = event.capacity > 0 ? Math.round((goingCount / event.capacity) * 100) : 0;

  const recentRegistrations = [...registrations]
    .sort((a, b) => new Date(b.registration.createdAt).getTime() - new Date(a.registration.createdAt).getTime())
    .slice(0, 5);

  const handleCopyLink = async () => {
    const baseUrl = window.location.origin;
    const url = event.visibility === 'private' && event.inviteCode
      ? `${baseUrl}/invite/${event.inviteCode}`
      : `${baseUrl}/user/events/${event.id}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success('Link copied');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApprove = (registrationId: string) => {
    startTransition(async () => {
      try {
        await approveRegistration(registrationId, event.id);
        toast.success('Registration approved');
      } catch {
        toast.error('Failed to approve registration');
      }
    });
  };

  const handleDeny = (registrationId: string) => {
    startTransition(async () => {
      try {
        await denyRegistration(registrationId, event.id);
        toast.success('Registration denied');
      } catch {
        toast.error('Failed to deny registration');
      }
    });
  };

  // Cover image rendering
  const gradient = event.coverImage ? parseGradient(event.coverImage) : null;
  const coverStyle = gradient
    ? { background: gradientConfigToCSS(gradient) }
    : event.coverImage
      ? { backgroundImage: `url(${event.coverImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }
      : { background: '#e5e7eb' };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      {/* Quick Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
          <Pencil className="h-3.5 w-3.5 mr-1.5" />
          Edit Event
        </Button>
        <Button variant="outline" size="sm" onClick={handleCopyLink}>
          {copied ? <Check className="h-3.5 w-3.5 mr-1.5" /> : <Copy className="h-3.5 w-3.5 mr-1.5" />}
          {copied ? 'Copied' : 'Copy Link'}
        </Button>
        <Link href={`/user/events/${event.id}`} target="_blank">
          <Button variant="outline" size="sm">
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
            Event Page
          </Button>
        </Link>
      </div>

      {/* Event Preview */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Cover Image */}
        <div
          className="w-full sm:w-48 h-32 sm:h-auto sm:min-h-[160px] rounded-xl shrink-0"
          style={coverStyle}
        />

        {/* When & Where */}
        <div className="space-y-3 flex-1">
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-1.5">When & Where</h3>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{formatDate(event.date)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <span>
                  {formatTime(event.date)}
                  {event.endDate && ` - ${formatTime(event.endDate)}`}
                </span>
              </div>
              {event.location && (
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{event.location}</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={event.status === 'open' ? 'border-green-500/20 text-green-600' : ''}>
              {event.status}
            </Badge>
            <Badge variant="outline">
              {event.visibility}
            </Badge>
            {event.requireApproval && (
              <Badge variant="outline" className="border-amber-500/20 text-amber-600">
                approval required
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Description */}
      {event.description && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-1.5">Description</h3>
          <div
            className="prose prose-sm max-w-none text-sm text-muted-foreground"
            dangerouslySetInnerHTML={{ __html: event.description }}
          />
        </div>
      )}

      {/* Guests Section */}
      <div className="border-t pt-6">
        <h3 className="text-sm font-semibold mb-3">Guests</h3>
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-sm">
              <span className="text-2xl font-bold">{goingCount}</span>{' '}
              <span className="text-muted-foreground">Going</span>
            </span>
            <span className="text-sm text-muted-foreground">cap {event.capacity}</span>
          </div>
          <Progress value={Math.min(percent, 100)} className="h-2" />
          {pendingCount > 0 && (
            <p className="text-sm text-amber-600">
              {pendingCount} Pending Approval
            </p>
          )}
        </div>

        {/* Recent Registrations */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium">Recent Registrations</h4>
            <Button variant="ghost" size="sm" className="text-xs" onClick={onSwitchToGuests}>
              All Guests →
            </Button>
          </div>
          {recentRegistrations.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No registrations yet.</p>
          ) : (
            <div className="space-y-1">
              {recentRegistrations.map(({ registration, user }) => (
                <div key={registration.id} className="flex items-center justify-between rounded-lg border p-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar className="h-7 w-7">
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
                  <div className="flex items-center gap-1.5 ml-2">
                    {registration.status === 'pending_approval' ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs text-green-600 hover:text-green-700 hover:bg-green-500/10"
                          onClick={() => handleApprove(registration.id)}
                          disabled={isPending}
                        >
                          Approve
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-500/10"
                          onClick={() => handleDeny(registration.id)}
                          disabled={isPending}
                        >
                          Decline
                        </Button>
                      </>
                    ) : (
                      <Badge variant="outline" className={`text-xs ${statusColors[registration.status] || ''}`}>
                        {registration.status.replace('_', ' ')}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Edit Event Sheet */}
      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent className="sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Edit Event</SheetTitle>
          </SheetHeader>
          <div className="mt-6">
            <EventForm event={event} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
```

**Step 2: Verify build**

Run: `cd /Users/datct/CSProjects/WorkProjects/latte-lab/latte-lab-frontend && pnpm build`
Expected: Build succeeds (component is created but not yet imported anywhere, so it should compile without issues).

**Step 3: Commit**

```bash
git add components/admin/event-overview.tsx
git commit -m "feat: create EventOverview component for Overview tab"
```

---

## Task 3: Create `guest-list.tsx` (Guests tab)

**Files:**
- Create: `latte-lab-frontend/components/admin/guest-list.tsx`

**Context:**
- Refactored from `registrations-table.tsx` with added features:
  - At-a-Glance stats bar with progress
  - Search input (filters by name/email)
  - Status filter dropdown (All Guests, Going, Pending Approval, Waitlisted, Rejected, Not Going, Checked In)
  - Sort dropdown (Name, Email, Status, Register Time)
  - Check In Guests button → navigates to checkin page
  - Run Lottery button (when requireApproval is on and event is open)
  - Approve/Decline for pending_approval rows, Remove for others

**Step 1: Create the component**

Create `components/admin/guest-list.tsx`:

```typescript
'use client';

import { useState, useMemo, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LotteryDraw } from '@/components/admin/lottery-draw';
import { approveRegistration, denyRegistration, removeRegistration } from '@/app/actions/events';
import { toast } from 'sonner';
import { Search, ClipboardCheck, Trash2, Check, X } from 'lucide-react';
import Link from 'next/link';
import type { Event } from '@/lib/db/schema';

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
  selected: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  rejected: 'bg-red-500/10 text-red-500 border-red-500/20',
  checked_in: 'bg-green-500/10 text-green-700 border-green-500/20',
  no_show: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
  pending_approval: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
};

type StatusFilter = 'all' | 'going' | 'pending_approval' | 'waitlisted' | 'rejected' | 'not_going' | 'checked_in';
type SortBy = 'register_time' | 'name' | 'email' | 'status';

const STATUS_FILTER_MAP: Record<StatusFilter, string[]> = {
  all: [],
  going: ['registered', 'selected', 'checked_in'],
  pending_approval: ['pending_approval'],
  waitlisted: ['waitlisted'],
  rejected: ['rejected'],
  not_going: ['no_show'],
  checked_in: ['checked_in'],
};

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function GuestList({
  event,
  registrations,
}: {
  event: Event;
  registrations: Registration[];
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('register_time');
  const [isPending, startTransition] = useTransition();

  // Counts for filter labels
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of registrations) {
      c[r.registration.status] = (c[r.registration.status] || 0) + 1;
    }
    return {
      all: registrations.length,
      going: (c['registered'] || 0) + (c['selected'] || 0) + (c['checked_in'] || 0),
      pending_approval: c['pending_approval'] || 0,
      waitlisted: c['waitlisted'] || 0,
      rejected: c['rejected'] || 0,
      not_going: c['no_show'] || 0,
      checked_in: c['checked_in'] || 0,
    };
  }, [registrations]);

  const goingCount = counts.going;
  const percent = event.capacity > 0 ? Math.round((goingCount / event.capacity) * 100) : 0;

  // Filter + search + sort
  const displayed = useMemo(() => {
    let list = [...registrations];

    // Status filter
    const allowedStatuses = STATUS_FILTER_MAP[statusFilter];
    if (allowedStatuses.length > 0) {
      list = list.filter(r => allowedStatuses.includes(r.registration.status));
    }

    // Search
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        r.user.name?.toLowerCase().includes(q) ||
        r.user.email?.toLowerCase().includes(q)
      );
    }

    // Sort
    list.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return (a.user.name || '').localeCompare(b.user.name || '');
        case 'email':
          return (a.user.email || '').localeCompare(b.user.email || '');
        case 'status':
          return a.registration.status.localeCompare(b.registration.status);
        case 'register_time':
        default:
          return new Date(b.registration.createdAt).getTime() - new Date(a.registration.createdAt).getTime();
      }
    });

    return list;
  }, [registrations, statusFilter, search, sortBy]);

  const handleApprove = (registrationId: string) => {
    startTransition(async () => {
      try {
        await approveRegistration(registrationId, event.id);
        toast.success('Registration approved');
      } catch {
        toast.error('Failed to approve registration');
      }
    });
  };

  const handleDeny = (registrationId: string) => {
    startTransition(async () => {
      try {
        await denyRegistration(registrationId, event.id);
        toast.success('Registration denied');
      } catch {
        toast.error('Failed to deny registration');
      }
    });
  };

  const handleRemove = (registrationId: string) => {
    startTransition(async () => {
      try {
        await removeRegistration(registrationId, event.id);
        toast.success('Registration removed');
      } catch {
        toast.error('Failed to remove registration');
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* At a Glance */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">At a Glance</h3>
        <div className="flex items-baseline justify-between">
          <div className="flex items-baseline gap-4">
            <span className="text-sm">
              <span className="text-2xl font-bold">{goingCount}</span>{' '}
              <span className="text-muted-foreground">Going</span>
            </span>
            {counts.pending_approval > 0 && (
              <span className="text-sm">
                <span className="text-lg font-bold text-amber-600">{counts.pending_approval}</span>{' '}
                <span className="text-muted-foreground">Pending</span>
              </span>
            )}
          </div>
          <span className="text-sm text-muted-foreground">cap {event.capacity}</span>
        </div>
        <Progress value={Math.min(percent, 100)} className="h-2" />
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/admin/events/${event.id}/checkin`}>
          <Button variant="outline" size="sm">
            <ClipboardCheck className="h-3.5 w-3.5 mr-1.5" />
            Check In Guests
          </Button>
        </Link>
        {event.requireApproval && event.status === 'open' && (
          <LotteryDraw eventId={event.id} entrantCount={counts.pending_approval} />
        )}
      </div>

      {/* Guest List */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Guest List</h3>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search guests..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Guests ({counts.all})</SelectItem>
              <SelectItem value="going">Going ({counts.going})</SelectItem>
              <SelectItem value="pending_approval">Pending Approval ({counts.pending_approval})</SelectItem>
              <SelectItem value="waitlisted">Waitlisted ({counts.waitlisted})</SelectItem>
              <SelectItem value="rejected">Rejected ({counts.rejected})</SelectItem>
              <SelectItem value="not_going">Not Going ({counts.not_going})</SelectItem>
              <SelectItem value="checked_in">Checked In ({counts.checked_in})</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
            <SelectTrigger className="w-[160px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="register_time">Register Time</SelectItem>
              <SelectItem value="name">Name</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="status">Status</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* List */}
        {displayed.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground text-sm">No guests found.</p>
        ) : (
          <div className="space-y-1">
            {displayed.map(({ registration, user }) => (
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
                  {event.requireApproval && registration.lotteryPriorityScore != null && (
                    <span className="text-xs text-muted-foreground">
                      Score: {registration.lotteryPriorityScore.toFixed(1)}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground hidden sm:inline">
                    {formatRelativeTime(registration.createdAt)}
                  </span>
                  <Badge variant="outline" className={`text-xs ${statusColors[registration.status] || ''}`}>
                    {registration.status.replace('_', ' ')}
                  </Badge>
                  {registration.status === 'pending_approval' ? (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-500/10"
                        onClick={() => handleApprove(registration.id)}
                        disabled={isPending}
                        title="Approve"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-500/10"
                        onClick={() => handleDeny(registration.id)}
                        disabled={isPending}
                        title="Decline"
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
        )}
      </div>
    </div>
  );
}
```

**Step 2: Verify build**

Run: `cd /Users/datct/CSProjects/WorkProjects/latte-lab/latte-lab-frontend && pnpm build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add components/admin/guest-list.tsx
git commit -m "feat: create GuestList component for Guests tab with filtering and sorting"
```

---

## Task 4: Create `event-settings.tsx` (More tab)

**Files:**
- Create: `latte-lab-frontend/components/admin/event-settings.tsx`

**Context:**
- Reuses existing `CloseRegistrationButton` and `InviteLinkCard`
- Adds Delete Event with confirmation dialog
- Sections: Registration, Private Event (conditional), Danger Zone

**Step 1: Create the component**

Create `components/admin/event-settings.tsx`:

```typescript
'use client';

import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { CloseRegistrationButton } from '@/components/admin/close-registration-button';
import { InviteLinkCard } from '@/components/admin/invite-link-card';
import { deleteEventAction } from '@/app/actions/events';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import type { Event } from '@/lib/db/schema';

export function EventSettings({ event }: { event: Event }) {
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    startTransition(async () => {
      try {
        await deleteEventAction(event.id);
      } catch {
        toast.error('Failed to delete event');
      }
    });
  };

  return (
    <div className="space-y-8">
      {/* Registration */}
      {event.status === 'open' && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Registration</h3>
          <div className="rounded-xl border p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Close Registration</p>
                <p className="text-xs text-muted-foreground">Prevent new registrations for this event.</p>
              </div>
              <CloseRegistrationButton eventId={event.id} />
            </div>
          </div>
        </div>
      )}

      {/* Private Event - Invite Code */}
      {event.visibility === 'private' && event.inviteCode && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Private Event</h3>
          <InviteLinkCard eventId={event.id} inviteCode={event.inviteCode} />
        </div>
      )}

      {/* Danger Zone */}
      <div>
        <h3 className="text-sm font-semibold text-red-600 mb-3">Danger Zone</h3>
        <div className="rounded-xl border border-red-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Delete Event</p>
              <p className="text-xs text-muted-foreground">
                Permanently delete this event and all registrations. This cannot be undone.
              </p>
            </div>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  Delete
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete Event</DialogTitle>
                  <DialogDescription>
                    Are you sure you want to delete &quot;{event.name}&quot;? This will permanently
                    remove the event and all associated registrations, access records, and lottery
                    history. This action cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
                    {isPending ? 'Deleting...' : 'Delete Event'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Verify build**

Run: `cd /Users/datct/CSProjects/WorkProjects/latte-lab/latte-lab-frontend && pnpm build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add components/admin/event-settings.tsx
git commit -m "feat: create EventSettings component for More tab"
```

---

## Task 5: Rewrite `/admin/events/[id]/page.tsx` with 3-tab layout

**Files:**
- Modify: `latte-lab-frontend/app/(admin)/admin/events/[id]/page.tsx` (full rewrite)

**Context:**
- Server component that fetches event + registrations
- Renders `PageHeader` with event name
- Renders 3-tab layout using a new client wrapper component
- The client wrapper manages the active tab state (needed for "All Guests →" callback from Overview)

Since the `Tabs` component is client-side and we need the `onSwitchToGuests` callback to change the active tab, we need a client component wrapper for the tabs. We'll create this inline in the page file or as a separate component. To keep it clean, we'll create a small client wrapper.

**Step 1: Create the client tab wrapper**

Create `components/admin/event-management-tabs.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EventOverview } from '@/components/admin/event-overview';
import { GuestList } from '@/components/admin/guest-list';
import { EventSettings } from '@/components/admin/event-settings';
import type { Event } from '@/lib/db/schema';

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

export function EventManagementTabs({
  event,
  registrations,
}: {
  event: Event;
  registrations: Registration[];
}) {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="guests">
          Guests ({registrations.length})
        </TabsTrigger>
        <TabsTrigger value="more">More</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="mt-6">
        <EventOverview
          event={event}
          registrations={registrations}
          onSwitchToGuests={() => setActiveTab('guests')}
        />
      </TabsContent>

      <TabsContent value="guests" className="mt-6">
        <GuestList event={event} registrations={registrations} />
      </TabsContent>

      <TabsContent value="more" className="mt-6">
        <EventSettings event={event} />
      </TabsContent>
    </Tabs>
  );
}
```

**Step 2: Rewrite the page**

Rewrite `app/(admin)/admin/events/[id]/page.tsx`:

```typescript
import { auth } from '@/auth';
import { redirect, notFound } from 'next/navigation';
import { getEventById, getEventRegistrations } from '@/lib/db/event-queries';
import { PageHeader } from '@/components/ui/page-header';
import { EventManagementTabs } from '@/components/admin/event-management-tabs';

export default async function AdminEventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (!session.user.isAdmin) redirect('/user');

  const { id } = await params;
  const event = await getEventById(id);
  if (!event) notFound();

  const registrations = await getEventRegistrations(id);

  return (
    <>
      <PageHeader title={event.name} showSidebarTrigger />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-4 py-6">
          <EventManagementTabs event={event} registrations={registrations} />
        </div>
      </div>
    </>
  );
}
```

**Step 3: Verify build**

Run: `cd /Users/datct/CSProjects/WorkProjects/latte-lab/latte-lab-frontend && pnpm build`
Expected: Build succeeds. The old `registrations-table.tsx` import is no longer used from this page. Check for any other importers before deleting.

**Step 4: Check if `registrations-table.tsx` is imported anywhere else**

Run: `grep -r "registrations-table" latte-lab-frontend/app latte-lab-frontend/components --include="*.tsx" --include="*.ts"`

If no other files import it, it can be deleted in a later cleanup step. Keep it for now to avoid breaking anything.

**Step 5: Commit**

```bash
git add components/admin/event-management-tabs.tsx app/\(admin\)/admin/events/\[id\]/page.tsx
git commit -m "feat: rewrite event detail page with 3-tab layout (Overview, Guests, More)"
```

---

## Task 6: Rewrite `checkin-list.tsx` with filter tabs + inline check-in info

**Files:**
- Modify: `latte-lab-frontend/components/admin/checkin-list.tsx` (full rewrite)

**Context:**
- Filter tabs: All Guests, Going (count), Checked In (count)
- Each row: avatar, name, email, then either [Check In] button or "Checked in {time}" + [Undo]
- Back button, Scan button (noop), Close Event at bottom
- Event name + date in header
- Mobile-friendly layout

**Step 1: Rewrite the component**

Rewrite `components/admin/checkin-list.tsx`:

```typescript
'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { checkinAttendee, undoCheckin, closeEvent } from '@/app/actions/events';
import { useState, useTransition, useMemo } from 'react';
import { toast } from 'sonner';
import { ArrowLeft, Search, ScanLine, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import Link from 'next/link';

interface Attendee {
  registration: {
    id: string;
    status: string;
    updatedAt: Date;
  };
  user: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
  };
}

type FilterTab = 'all' | 'going' | 'checked_in';

export function CheckinList({
  attendees,
  eventId,
  eventName,
  eventDate,
}: {
  attendees: Attendee[];
  eventId: string;
  eventName: string;
  eventDate: Date;
}) {
  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [isPending, startTransition] = useTransition();
  const [showClose, setShowClose] = useState(false);

  const checkedInCount = attendees.filter(a => a.registration.status === 'checked_in').length;
  const goingCount = attendees.filter(a => ['registered', 'selected'].includes(a.registration.status)).length;
  const total = attendees.length;

  const filtered = useMemo(() => {
    let list = [...attendees];

    // Filter by tab
    if (filterTab === 'going') {
      list = list.filter(a => ['registered', 'selected'].includes(a.registration.status));
    } else if (filterTab === 'checked_in') {
      list = list.filter(a => a.registration.status === 'checked_in');
    }

    // Search
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(a =>
        a.user.name?.toLowerCase().includes(q) ||
        a.user.email?.toLowerCase().includes(q)
      );
    }

    return list;
  }, [attendees, search, filterTab]);

  const handleCheckin = (attendee: Attendee) => {
    startTransition(async () => {
      try {
        await checkinAttendee(attendee.registration.id, eventId);
        toast.success(`${attendee.user.name || 'Guest'} checked in`);
      } catch {
        toast.error('Failed to check in');
      }
    });
  };

  const handleUndo = (attendee: Attendee) => {
    startTransition(async () => {
      try {
        // Default to 'registered' as previous status
        await undoCheckin(attendee.registration.id, eventId, 'registered');
        toast.success(`Check-in undone for ${attendee.user.name || 'Guest'}`);
      } catch {
        toast.error('Failed to undo check-in');
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

  const formatCheckinTime = (date: Date) => {
    return new Date(date).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const formatEventDate = (date: Date) => {
    const d = new Date(date);
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const isToday = d.toDateString() === now.toDateString();
    const isTomorrow = d.toDateString() === tomorrow.toDateString();

    const prefix = isToday ? 'today' : isTomorrow ? 'tomorrow' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    return `${prefix}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  };

  const tabs: { key: FilterTab; label: string; count?: number }[] = [
    { key: 'all', label: 'All Guests' },
    { key: 'going', label: 'Going', count: goingCount },
    { key: 'checked_in', label: 'Checked In', count: checkedInCount },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 border-b p-4 space-y-3">
        <div className="flex items-center justify-between">
          <Link href={`/admin/events/${eventId}`}>
            <Button variant="ghost" size="sm" className="gap-1.5 -ml-2">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>
          <div className="text-right">
            <h1 className="text-base font-semibold truncate">{eventName}</h1>
            <p className="text-xs text-muted-foreground">{formatEventDate(eventDate)}</p>
          </div>
          <Button variant="outline" size="sm" disabled title="Coming soon">
            <ScanLine className="h-4 w-4 mr-1.5" />
            Scan
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search for a guest..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilterTab(tab.key)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                filterTab === tab.key
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className="ml-1.5 text-xs opacity-70">{tab.count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="py-12 text-center text-muted-foreground text-sm">No guests found.</p>
        ) : (
          filtered.map((attendee) => {
            const isCheckedIn = attendee.registration.status === 'checked_in';
            return (
              <div
                key={attendee.registration.id}
                className={`flex w-full items-center gap-3 border-b px-4 py-3 ${
                  isCheckedIn ? 'bg-green-500/5' : ''
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
                  {isCheckedIn && (
                    <p className="text-xs text-green-600 mt-0.5">
                      <Check className="inline h-3 w-3 mr-0.5" />
                      Checked in {formatCheckinTime(attendee.registration.updatedAt)}
                    </p>
                  )}
                </div>
                <div className="shrink-0">
                  {isCheckedIn ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => handleUndo(attendee)}
                      disabled={isPending}
                    >
                      Undo
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      className="text-xs"
                      onClick={() => handleCheckin(attendee)}
                      disabled={isPending}
                    >
                      Check In
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        )}
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

**Step 2: Verify build**

Run: `cd /Users/datct/CSProjects/WorkProjects/latte-lab/latte-lab-frontend && pnpm build`
Expected: May fail because the `Attendee` interface now expects `updatedAt` in `registration` but the checkin page might not pass it. We fix that in the next task.

**Step 3: Commit (after Task 7 if build depends on it)**

Hold this commit until Task 7 is done.

---

## Task 7: Update checkin `page.tsx` to pass event date + updatedAt

**Files:**
- Modify: `latte-lab-frontend/app/(admin)/admin/events/[id]/checkin/page.tsx`
- Modify: `latte-lab-frontend/lib/db/event-queries.ts` (update `getCheckinAttendees` to include `updatedAt`)

**Step 1: Update `getCheckinAttendees` in event-queries.ts**

The existing query at ~line 304 returns `eventRegistrations` (full object) joined with user info. The `eventRegistrations` object already includes `updatedAt` since it selects the full `eventRegistrations` table. So we just need to verify this — the `registration` field already maps to the full `eventRegistrations` row which includes `updatedAt`.

Check the return shape: `registration: eventRegistrations` — this is the full table object, which includes `updatedAt`. No change needed to the query.

**Step 2: Update the checkin page to pass eventDate**

Modify `app/(admin)/admin/events/[id]/checkin/page.tsx`:

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
      <CheckinList
        attendees={attendees}
        eventId={id}
        eventName={event.name}
        eventDate={event.date}
      />
    </div>
  );
}
```

**Step 3: Verify build**

Run: `cd /Users/datct/CSProjects/WorkProjects/latte-lab/latte-lab-frontend && pnpm build`
Expected: Build succeeds. The `attendees` data from `getCheckinAttendees` returns `registration: eventRegistrations` which is the full row including `updatedAt`.

**Step 4: Commit (Task 6 + 7 together)**

```bash
git add components/admin/checkin-list.tsx app/\(admin\)/admin/events/\[id\]/checkin/page.tsx
git commit -m "feat: revamp check-in page with filter tabs, inline timestamps, and back navigation"
```

---

## Task 8: Cleanup + final build verification

**Files:**
- Potentially delete: `latte-lab-frontend/components/admin/registrations-table.tsx` (if unused)

**Step 1: Check if registrations-table.tsx is still imported**

Run: `grep -r "registrations-table\|RegistrationsTable" latte-lab-frontend/app latte-lab-frontend/components --include="*.tsx" --include="*.ts"`

If the only hit is the file itself (its own export), delete it. If other files still import it, leave it.

**Step 2: Delete if unused**

```bash
rm components/admin/registrations-table.tsx
```

**Step 3: Final build**

Run: `cd /Users/datct/CSProjects/WorkProjects/latte-lab/latte-lab-frontend && pnpm build`
Expected: Build succeeds with zero errors.

**Step 4: Manual verification**

Run: `cd /Users/datct/CSProjects/WorkProjects/latte-lab/latte-lab-frontend && pnpm dev`

Verify in browser:
- [ ] Navigate to `/admin/events/{id}` — see 3 tabs (Overview, Guests, More)
- [ ] **Overview tab**: event preview, At-a-Glance stats, Recent Registrations, Edit Event opens Sheet, Copy Link works, Event Page link works
- [ ] **Overview → "All Guests →"**: switches to Guests tab
- [ ] **Guests tab**: At-a-Glance stats, search filters guests, status dropdown filters, sort dropdown sorts, approve/decline work, remove works
- [ ] **More tab**: Close Registration button works, Invite Code section shows for private events, Delete Event with confirmation works
- [ ] **Check-in page** (`/admin/events/{id}/checkin`): Back button returns to management page, filter tabs work, Check In / Undo buttons work, timestamps show, Scan button is disabled, Close Event dialog works

**Step 5: Commit cleanup**

```bash
git add -A
git commit -m "chore: remove unused registrations-table.tsx, finalize event management revamp"
```

---

## Summary of all files

| # | File | Action |
|---|------|--------|
| 1 | `lib/db/event-queries.ts` | Add `deleteEvent` function |
| 2 | `app/actions/events.ts` | Add `deleteEventAction`, add `redirect` import |
| 3 | `components/admin/event-overview.tsx` | Create — Overview tab |
| 4 | `components/admin/guest-list.tsx` | Create — Guests tab |
| 5 | `components/admin/event-settings.tsx` | Create — More tab |
| 6 | `components/admin/event-management-tabs.tsx` | Create — Client tab wrapper |
| 7 | `app/(admin)/admin/events/[id]/page.tsx` | Rewrite — 3-tab layout |
| 8 | `components/admin/checkin-list.tsx` | Rewrite — filter tabs + inline timestamps |
| 9 | `app/(admin)/admin/events/[id]/checkin/page.tsx` | Modify — pass `eventDate` prop |
| 10 | `components/admin/registrations-table.tsx` | Delete (if unused) |
