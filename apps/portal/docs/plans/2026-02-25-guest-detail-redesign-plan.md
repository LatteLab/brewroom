# Guest Detail Sheet Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the generic `UserDetailModal` in the guest list with a purpose-built `GuestDetailSheet` featuring a Luma-style timeline, audit logging of status changes, and fine-grained approval tracking.

**Architecture:** New `registration_audit_log` DB table tracks every status transition. A new `GuestDetailSheet` component replaces `UserDetailModal` in the guest list, showing event-specific context (registration time, timeline, status actions) alongside existing member stats and event history. All status-change server actions are instrumented to write audit entries.

**Tech Stack:** Next.js (App Router), Drizzle ORM, Supabase (PostgreSQL), shadcn/ui Sheet, Tailwind CSS v4, Lucide icons.

---

### Task 1: Add `registration_audit_log` table to schema

**Files:**
- Modify: `lib/db/schema.ts` (after line 130, after `lotteryHistory` table)

**Step 1: Add the table definition and type exports**

Add after the `lotteryHistory` table (line 130):

```typescript
// Registration audit log — tracks every status change with actor info
export const registrationAuditLog = pgTable('registration_audit_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  registrationId: uuid('registration_id').references(() => eventRegistrations.id, { onDelete: 'cascade' }),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  oldStatus: text('old_status'),
  newStatus: text('new_status').notNull(),
  action: text('action').notNull(), // 'registered', 'approved', 'denied', 'lottery_won', 'lottery_lost', 'checked_in', 'no_show', 'status_changed', 'removed'
  actorId: text('actor_id').references(() => users.id, { onDelete: 'set null' }),
  actorType: text('actor_type').notNull(), // 'user', 'admin', 'system'
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

Add type exports at end of file:

```typescript
export type RegistrationAuditLog = typeof registrationAuditLog.$inferSelect;
export type NewRegistrationAuditLog = typeof registrationAuditLog.$inferInsert;
```

**Step 2: Apply migration via Supabase MCP**

Use `apply_migration` with name `add_registration_audit_log` and the SQL:

```sql
CREATE TABLE registration_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID REFERENCES event_registrations(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_type TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_audit_log_registration ON registration_audit_log(registration_id);
CREATE INDEX idx_audit_log_event ON registration_audit_log(event_id);
```

**Step 3: Commit**

```bash
git add lib/db/schema.ts
git commit -m "feat: add registration_audit_log table to schema"
```

---

### Task 2: Add audit log query functions

**Files:**
- Modify: `lib/db/event-queries.ts`

**Step 1: Add imports**

At line 2 of `lib/db/event-queries.ts`, add `registrationAuditLog` to the schema import:

```typescript
import { events, eventRegistrations, eventAccess, lotteryHistory, users, semesters, registrationAuditLog } from './schema';
```

Also add `NewRegistrationAuditLog` to the type import:

```typescript
import type { Event, NewEvent, EventRegistration, NewRegistrationAuditLog } from './schema';
```

**Step 2: Add audit log functions**

Add a new section at the end of the file (before closing):

```typescript
// ============================================================================
// Registration Audit Log Queries
// ============================================================================

export async function createAuditLogEntry(entry: NewRegistrationAuditLog) {
  const [row] = await db.insert(registrationAuditLog).values(entry).returning();
  return row;
}

export async function createAuditLogEntries(entries: NewRegistrationAuditLog[]) {
  if (entries.length === 0) return;
  await db.insert(registrationAuditLog).values(entries);
}

export async function getRegistrationAuditLog(registrationId: string) {
  return db.select({
    log: registrationAuditLog,
    actor: {
      id: users.id,
      name: users.name,
    },
  })
    .from(registrationAuditLog)
    .leftJoin(users, eq(registrationAuditLog.actorId, users.id))
    .where(eq(registrationAuditLog.registrationId, registrationId))
    .orderBy(desc(registrationAuditLog.createdAt));
}
```

**Step 3: Commit**

```bash
git add lib/db/event-queries.ts
git commit -m "feat: add audit log query functions"
```

---

### Task 3: Instrument server actions to write audit entries

**Files:**
- Modify: `app/actions/events.ts`

This is the largest task. Each status-change action needs an audit log entry. Below are the changes per function.

**Step 1: Add imports**

Add to the imports from `@/lib/db/event-queries`:

```typescript
import {
  // ... existing imports ...
  createAuditLogEntry,
  createAuditLogEntries,
  getRegistrationAuditLog as dbGetRegistrationAuditLog,
} from '@/lib/db/event-queries';
```

**Step 2: Instrument `registerForEvent` (line 100)**

After each `createRegistration()` call, add an audit log entry. The registration is created first, so we need its ID. Update the three `createRegistration` calls:

For the `pending_approval` case (~line 120):
```typescript
const reg = await createRegistration({
  userId: session.user.id,
  eventId,
  status: 'pending_approval',
});
await createAuditLogEntry({
  registrationId: reg.id,
  eventId,
  userId: session.user.id,
  oldStatus: null,
  newStatus: 'pending_approval',
  action: 'registered',
  actorId: null,
  actorType: 'user',
});
```

For the FCFS `registered` case (~line 133):
```typescript
const reg = await createRegistration({
  userId: session.user.id,
  eventId,
  status: 'registered',
});
await createAuditLogEntry({
  registrationId: reg.id,
  eventId,
  userId: session.user.id,
  oldStatus: null,
  newStatus: 'registered',
  action: 'registered',
  actorId: null,
  actorType: 'user',
});
```

For the `waitlisted` case (~line 139):
```typescript
const reg = await createRegistration({
  userId: session.user.id,
  eventId,
  status: 'waitlisted',
});
await createAuditLogEntry({
  registrationId: reg.id,
  eventId,
  userId: session.user.id,
  oldStatus: null,
  newStatus: 'waitlisted',
  action: 'registered',
  actorId: null,
  actorType: 'user',
});
```

**Step 3: Instrument `approveRegistration` (line 464)**

After `updateRegistration` (~line 479), add:

```typescript
const reg = await getPendingRegistration(registrationId, eventId);
// ... existing capacity check ...
await updateRegistration(registrationId, { status: 'registered' });
await createAuditLogEntry({
  registrationId,
  eventId,
  userId: reg.user.id,
  oldStatus: 'pending_approval',
  newStatus: 'registered',
  action: 'approved',
  actorId: session.user.id,
  actorType: 'admin',
});
```

Note: `getPendingRegistration` already returns the reg, so store it: `const reg = await getPendingRegistration(...)`.

**Step 4: Instrument `denyRegistration` (line 485)**

```typescript
const reg = await getPendingRegistration(registrationId, eventId);
await updateRegistration(registrationId, { status: 'rejected' });
await createAuditLogEntry({
  registrationId,
  eventId,
  userId: reg.user.id,
  oldStatus: 'pending_approval',
  newStatus: 'rejected',
  action: 'denied',
  actorId: session.user.id,
  actorType: 'admin',
});
```

**Step 5: Instrument `changeRegistrationStatus` (line 499)**

After the `updateRegistration` call (~line 534), add:

```typescript
await createAuditLogEntry({
  registrationId,
  eventId,
  userId: reg.user.id,
  oldStatus: reg.registration.status,
  newStatus: newStatus,
  action: 'status_changed',
  actorId: session.user.id,
  actorType: 'admin',
});
```

**Step 6: Instrument `finalizeLottery` (line 333)**

After the status updates and lottery history entries are created, add audit log entries for all participants:

```typescript
// After createLotteryHistoryEntries(historyEntries);
const auditEntries = [
  ...draftSelected.map(r => ({
    registrationId: r.registration.id,
    eventId,
    userId: r.user.id,
    oldStatus: 'draft_selected',
    newStatus: 'selected',
    action: 'lottery_won' as const,
    actorId: null as string | null,
    actorType: 'system',
  })),
  ...draftRejected.map(r => ({
    registrationId: r.registration.id,
    eventId,
    userId: r.user.id,
    oldStatus: 'draft_rejected',
    newStatus: 'rejected',
    action: 'lottery_lost' as const,
    actorId: null as string | null,
    actorType: 'system',
  })),
];
await createAuditLogEntries(auditEntries);
```

**Step 7: Instrument `checkinAttendee` (line 414)**

```typescript
export async function checkinAttendee(registrationId: string, eventId: string) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const regs = await getEventRegistrations(eventId);
  const reg = regs.find(r => r.registration.id === registrationId);

  await updateRegistration(registrationId, { status: 'checked_in' });
  if (reg) {
    await createAuditLogEntry({
      registrationId,
      eventId,
      userId: reg.user.id,
      oldStatus: reg.registration.status,
      newStatus: 'checked_in',
      action: 'checked_in',
      actorId: session.user.id,
      actorType: 'admin',
    });
  }
  revalidatePath(`/admin/events/${eventId}/checkin`);
}
```

**Step 8: Instrument `removeRegistration` (line 442)**

Before deleting, log the removal:

```typescript
export async function removeRegistration(registrationId: string, eventId: string) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const regs = await getEventRegistrations(eventId);
  const reg = regs.find(r => r.registration.id === registrationId);
  if (!reg) throw new Error('Registration not found');

  await createAuditLogEntry({
    registrationId,
    eventId,
    userId: reg.user.id,
    oldStatus: reg.registration.status,
    newStatus: 'removed',
    action: 'removed',
    actorId: session.user.id,
    actorType: 'admin',
  });

  await deleteRegistration(reg.user.id, eventId);
  revalidatePath(`/admin/events/${eventId}`);
}
```

Note: The audit entry references `registrationId` via FK. Since `onDelete: cascade`, the audit entry will be deleted when the registration is deleted. This is acceptable — removal is a destructive action anyway. If we want to preserve audit after deletion, we'd need to change `onDelete` to `SET NULL`.

**Step 9: Add exported `getRegistrationAuditLog` server action**

Add at the end of the file:

```typescript
export async function getRegistrationTimeline(registrationId: string) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  return dbGetRegistrationAuditLog(registrationId);
}
```

**Step 10: Commit**

```bash
git add app/actions/events.ts
git commit -m "feat: instrument all status-change actions with audit logging"
```

---

### Task 4: Build the `GuestDetailSheet` component

**Files:**
- Create: `components/admin/events/guest-detail-sheet.tsx`

**Step 1: Create the component**

This is the main UI component. It receives the `Registration` data from the guest list (already in memory), and fetches audit log + event history on open.

```tsx
'use client';

import { useEffect, useState, useTransition, useCallback } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { StatusChangeDialog } from '@/components/admin/events/status-change-dialog';
import {
  Users, XCircle, Trophy, BarChart3,
  UserPlus, CheckCircle, ClipboardCheck,
  AlertTriangle, ArrowRight, Trash2, Pencil, ExternalLink,
} from 'lucide-react';
import { getRegistrationTimeline, getUserDetailForModal, removeRegistration } from '@/app/actions/events';
import { statusColors, statusLabels } from '@/lib/types/event';
import { toast } from 'sonner';
import Link from 'next/link';
import type { Registration } from '@/lib/types/event';

// Timeline entry from the audit log query
interface TimelineEntry {
  log: {
    id: string;
    action: string;
    oldStatus: string | null;
    newStatus: string;
    actorType: string;
    createdAt: Date;
  };
  actor: {
    id: string;
    name: string | null;
  } | null;
}

// User detail data from getUserDetailForModal
interface UserDetailData {
  user: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
    major?: string | null;
    classYear?: string | null;
    bio?: string | null;
  };
  stats: {
    noShowCount: number;
    eventsAttended: number;
    semesterLotteryWins: number;
    semesterLotteryLosses: number;
  };
  eventHistory: {
    eventName: string;
    eventDate: Date;
    status: string;
  }[];
}

const TIMELINE_ICONS: Record<string, { icon: typeof UserPlus; color: string }> = {
  registered: { icon: UserPlus, color: 'text-green-500' },
  approved: { icon: CheckCircle, color: 'text-green-500' },
  denied: { icon: XCircle, color: 'text-red-500' },
  lottery_won: { icon: Trophy, color: 'text-green-500' },
  lottery_lost: { icon: Trophy, color: 'text-red-500' },
  checked_in: { icon: ClipboardCheck, color: 'text-green-600' },
  no_show: { icon: AlertTriangle, color: 'text-gray-500' },
  status_changed: { icon: ArrowRight, color: 'text-blue-500' },
  removed: { icon: Trash2, color: 'text-red-500' },
};

function getTimelineLabel(entry: TimelineEntry): { title: string; subtitle: string } {
  const { log, actor } = entry;
  const actorName = actor?.name || 'Unknown';

  switch (log.action) {
    case 'registered': {
      const isPending = log.newStatus === 'pending_approval';
      return {
        title: isPending ? 'Registered (Pending Approval)' : log.newStatus === 'waitlisted' ? 'Registered (Waitlisted)' : 'Registered',
        subtitle: 'Self-registered',
      };
    }
    case 'approved':
      return {
        title: `${statusLabels[log.oldStatus || ''] || log.oldStatus} → ${statusLabels[log.newStatus] || log.newStatus}`,
        subtitle: `Approved by ${actorName}`,
      };
    case 'denied':
      return {
        title: `${statusLabels[log.oldStatus || ''] || log.oldStatus} → ${statusLabels[log.newStatus] || log.newStatus}`,
        subtitle: `Denied by ${actorName}`,
      };
    case 'lottery_won':
      return {
        title: 'Won Lottery',
        subtitle: 'Selected by lottery system',
      };
    case 'lottery_lost':
      return {
        title: 'Lost Lottery',
        subtitle: 'Not selected by lottery system',
      };
    case 'checked_in':
      return {
        title: 'Checked In',
        subtitle: `Checked in by ${actorName}`,
      };
    case 'no_show':
      return {
        title: 'Marked No-Show',
        subtitle: log.actorType === 'system' ? 'Marked by system' : `Marked by ${actorName}`,
      };
    case 'status_changed':
      return {
        title: `${statusLabels[log.oldStatus || ''] || log.oldStatus} → ${statusLabels[log.newStatus] || log.newStatus}`,
        subtitle: `Changed by ${actorName}`,
      };
    case 'removed':
      return {
        title: 'Removed',
        subtitle: `Removed by ${actorName}`,
      };
    default:
      return { title: log.action, subtitle: '' };
  }
}

function formatDateTime(date: Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

interface GuestDetailSheetProps {
  registration: Registration | null;
  eventId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GuestDetailSheet({
  registration,
  eventId,
  open,
  onOpenChange,
}: GuestDetailSheetProps) {
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [userDetail, setUserDetail] = useState<UserDetailData | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isRemoving, startRemoveTransition] = useTransition();
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);

  const fetchData = useCallback(() => {
    if (!registration) return;
    startTransition(async () => {
      const [timelineData, detailData] = await Promise.all([
        getRegistrationTimeline(registration.registration.id),
        getUserDetailForModal(registration.user.id),
      ]);
      setTimeline(timelineData);
      setUserDetail(detailData);
    });
  }, [registration]);

  useEffect(() => {
    if (open && registration) {
      fetchData();
    } else {
      setTimeline([]);
      setUserDetail(null);
    }
  }, [open, registration, fetchData]);

  const handleRemove = () => {
    if (!registration) return;
    startRemoveTransition(async () => {
      try {
        await removeRegistration(registration.registration.id, eventId);
        toast.success('Guest removed');
        onOpenChange(false);
      } catch {
        toast.error('Failed to remove guest');
      }
    });
  };

  const handleStatusChanged = () => {
    // Refetch timeline after status change
    fetchData();
  };

  const reg = registration;
  const user = reg?.user;
  const detail = userDetail;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Guest Details</SheetTitle>
          </SheetHeader>

          {isPending && !detail && (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-muted-foreground">Loading...</p>
            </div>
          )}

          {reg && user && (
            <div className="mt-6 space-y-6">
              {/* Header: Avatar + Name + Status Badge */}
              <div className="flex items-start gap-4">
                <Avatar className="h-14 w-14">
                  <AvatarImage src={user.image || undefined} />
                  <AvatarFallback className="text-lg">
                    {user.name?.split(' ').map(n => n[0]).join('') || '?'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold">{user.name || 'Unknown'}</h3>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                  {detail && (detail.user.classYear || detail.user.major) && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {[detail.user.classYear && `Class of ${detail.user.classYear}`, detail.user.major].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
                <Badge
                  variant="outline"
                  className={`text-xs cursor-pointer hover:opacity-80 shrink-0 ${statusColors[reg.registration.status] || ''}`}
                  onClick={() => setStatusDialogOpen(true)}
                >
                  {statusLabels[reg.registration.status] || reg.registration.status}
                  <Pencil className="h-3 w-3 ml-1" />
                </Badge>
              </div>

              {/* Bio */}
              {detail?.user.bio && (
                <p className="text-sm text-muted-foreground">{detail.user.bio}</p>
              )}

              {/* Registration Time */}
              <div>
                <p className="text-xs text-muted-foreground">Registration Time</p>
                <p className="text-sm font-medium">
                  {formatDateTime(reg.registration.createdAt)}
                </p>
              </div>

              <Separator />

              {/* Timeline */}
              <div>
                <h4 className="text-sm font-semibold mb-3">Timeline</h4>
                {timeline.length > 0 ? (
                  <div className="relative pl-6">
                    {/* Vertical line */}
                    <div className="absolute left-[11px] top-1 bottom-1 w-px bg-border" />

                    <div className="space-y-4">
                      {timeline.map((entry) => {
                        const iconConfig = TIMELINE_ICONS[entry.log.action] || TIMELINE_ICONS['status_changed'];
                        const Icon = iconConfig.icon;
                        const { title, subtitle } = getTimelineLabel(entry);

                        return (
                          <div key={entry.log.id} className="relative">
                            {/* Icon dot */}
                            <div className={`absolute -left-6 top-0.5 h-[22px] w-[22px] rounded-full bg-background border-2 border-border flex items-center justify-center`}>
                              <Icon className={`h-3 w-3 ${iconConfig.color}`} />
                            </div>
                            <div>
                              <p className="text-sm font-medium">{title}</p>
                              <p className="text-xs text-muted-foreground">{subtitle}</p>
                              <p className="text-xs text-muted-foreground">
                                {formatDateTime(entry.log.createdAt)}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : !isPending ? (
                  <p className="text-xs text-muted-foreground">No timeline data available.</p>
                ) : null}
              </div>

              <Separator />

              {/* Member Stats */}
              {detail && (
                <div>
                  <h4 className="text-sm font-semibold mb-3">Member Stats</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <Card>
                      <CardContent className="p-3 text-center">
                        <Users className="h-4 w-4 mx-auto mb-1 text-primary" />
                        <p className="text-xl font-bold">{detail.stats.eventsAttended}</p>
                        <p className="text-xs text-muted-foreground">Attended</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-3 text-center">
                        <XCircle className="h-4 w-4 mx-auto mb-1 text-destructive" />
                        <p className="text-xl font-bold">{detail.stats.noShowCount}</p>
                        <p className="text-xs text-muted-foreground">No-Shows</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-3 text-center">
                        <Trophy className="h-4 w-4 mx-auto mb-1 text-amber-500" />
                        <p className="text-xl font-bold">{detail.stats.semesterLotteryWins}</p>
                        <p className="text-xs text-muted-foreground">Lottery Wins (semester)</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-3 text-center">
                        <BarChart3 className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                        <p className="text-xl font-bold">{detail.stats.semesterLotteryLosses}</p>
                        <p className="text-xs text-muted-foreground">Lottery Losses (semester)</p>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}

              <Separator />

              {/* Event History */}
              {detail && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">Event History</h4>
                  {detail.eventHistory.length > 0 ? (
                    <div className="space-y-2">
                      {detail.eventHistory.map((h, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <div>
                            <p className="font-medium">{h.eventName}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(h.eventDate).toLocaleDateString('en-US', {
                                month: 'short', day: 'numeric', year: 'numeric',
                              })}
                            </p>
                          </div>
                          <Badge variant="outline" className={`text-xs ${statusColors[h.status] || ''}`}>
                            {statusLabels[h.status] || h.status.replaceAll('_', ' ')}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No event history.</p>
                  )}
                </div>
              )}

              <Separator />

              {/* Footer Actions */}
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/admin/users/${user.id}`}>
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                    View Full Profile
                  </Link>
                </Button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                      Remove Guest
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove guest?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will remove {user.name || 'this guest'} from the event. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleRemove}
                        disabled={isRemoving}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {isRemoving ? 'Removing...' : 'Remove'}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Status Change Dialog */}
      {reg && (
        <StatusChangeDialog
          registration={reg.registration}
          user={reg.user}
          eventId={eventId}
          open={statusDialogOpen}
          onOpenChange={(open) => {
            setStatusDialogOpen(open);
            if (!open) handleStatusChanged();
          }}
        />
      )}
    </>
  );
}
```

**Step 2: Commit**

```bash
git add components/admin/events/guest-detail-sheet.tsx
git commit -m "feat: add GuestDetailSheet component with timeline and audit log"
```

---

### Task 5: Wire up `GuestDetailSheet` in the guest list

**Files:**
- Modify: `components/admin/events/guest-list.tsx`

**Step 1: Replace `UserDetailModal` with `GuestDetailSheet`**

1. Replace the import (line 18):
   - Remove: `import { UserDetailModal } from '@/components/admin/users/user-detail-modal';`
   - Add: `import { GuestDetailSheet } from '@/components/admin/events/guest-detail-sheet';`

2. Remove the import of `getUserDetailForModal` from line 24 (no longer needed in this component).

3. Change state from `selectedUserId` to `selectedRegistration` (line 76):
   - Remove: `const [selectedUserId, setSelectedUserId] = useState<string | null>(null);`
   - Add: `const [selectedRegistration, setSelectedRegistration] = useState<Registration | null>(null);`

4. Update `handleRowClick` (line 188):
   ```typescript
   const handleRowClick = (reg: Registration) => {
     setSelectedRegistration(reg);
     setModalOpen(true);
   };
   ```

5. Update the row `onClick` (line 313):
   ```typescript
   onClick={() => handleRowClick({ registration, user, stats })}
   ```

6. Replace the `UserDetailModal` at the bottom (lines 423-429):
   ```tsx
   <GuestDetailSheet
     registration={selectedRegistration}
     eventId={event.id}
     open={modalOpen}
     onOpenChange={setModalOpen}
   />
   ```

7. Also remove the standalone `StatusChangeDialog` usage at lines 432-439 since `GuestDetailSheet` includes its own status change via the clickable badge. However, keep the clickable badge on the guest list row as well — both entry points should work. The `StatusChangeDialog` triggered from the row badge can stay as-is.

**Step 2: Commit**

```bash
git add components/admin/events/guest-list.tsx
git commit -m "feat: replace UserDetailModal with GuestDetailSheet in guest list"
```

---

### Task 6: Verify and polish

**Step 1: Run build**

```bash
pnpm build
```

Fix any TypeScript errors.

**Step 2: Manual testing checklist**

- Open an event's guest tab
- Click a guest row → `GuestDetailSheet` opens
- Verify: avatar, name, email, class/major displayed
- Verify: registration time shown
- Verify: timeline section shows (may be empty for existing registrations)
- Verify: member stats 2x2 grid present
- Verify: event history list present
- Click status badge → `StatusChangeDialog` opens
- Change status → dialog closes, timeline refetches and shows new entry
- Click "Remove Guest" → confirmation dialog → guest removed, sheet closes
- Click "View Full Profile" → navigates to `/admin/users/[id]`
- Register a new user for the event → check their timeline shows "Registered" entry
- Approve a pending user → check timeline shows "Approved by [admin name]"

**Step 3: Final commit**

```bash
git add -A
git commit -m "polish: fix any build/lint issues from guest detail redesign"
```
