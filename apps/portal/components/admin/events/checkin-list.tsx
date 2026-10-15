'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { checkinAttendee, undoCheckin, closeEvent } from '@/app/actions/events';
import { useState, useTransition, useMemo } from 'react';
import { toast } from 'sonner';
import { ArrowLeft, Search, ScanLine, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { GuestDetailSheet } from '@/components/admin/events/guest-detail-sheet';
import Link from 'next/link';
import type { Registration, EventQuestion } from '@/lib/types/event';

type FilterTab = 'all' | 'going' | 'checked_in';

export function CheckinList({
  attendees,
  eventId,
  eventName,
  eventDate,
  eventStatus,
  questions,
}: {
  attendees: Registration[];
  eventId: string;
  eventName: string;
  eventDate: Date;
  eventStatus: string;
  questions: EventQuestion[] | null;
}) {
  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [isPending, startTransition] = useTransition();
  const [showClose, setShowClose] = useState(false);
  const [selectedAttendee, setSelectedAttendee] = useState<Registration | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const checkedInCount = attendees.filter(a => a.registration.status === 'checked_in').length;
  const goingCount = attendees.filter(a => ['registered', 'selected'].includes(a.registration.status)).length;
  const total = attendees.length;

  const filtered = useMemo(() => {
    let list = [...attendees];

    if (filterTab === 'going') {
      list = list.filter(a => ['registered', 'selected'].includes(a.registration.status));
    } else if (filterTab === 'checked_in') {
      list = list.filter(a => a.registration.status === 'checked_in');
    }

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(a =>
        a.user.name?.toLowerCase().includes(q) ||
        a.user.email?.toLowerCase().includes(q)
      );
    }

    return list;
  }, [attendees, search, filterTab]);

  const handleCheckin = (attendee: Registration) => {
    startTransition(async () => {
      try {
        await checkinAttendee(attendee.registration.id, eventId);
        toast.success(`${attendee.user.name || 'Guest'} checked in`);
      } catch {
        toast.error('Failed to check in');
      }
    });
  };

  const handleUndo = (attendee: Registration) => {
    startTransition(async () => {
      try {
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
                <button
                  type="button"
                  className="flex flex-1 items-center gap-3 min-w-0 rounded-md -m-1 p-1 transition-colors hover:bg-muted/50 active:bg-muted/70 text-left"
                  onClick={() => {
                    setSelectedAttendee(attendee);
                    setSheetOpen(true);
                  }}
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
                </button>
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
      {eventStatus !== 'closed' && (
        <div className="shrink-0 border-t p-4">
          <Button
            variant="destructive"
            className="w-full"
            onClick={() => setShowClose(true)}
          >
            Close Event
          </Button>
        </div>
      )}

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

      <GuestDetailSheet
        registration={selectedAttendee}
        eventId={eventId}
        questions={questions}
        pairing={null}
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) setSelectedAttendee(null);
        }}
      />
    </div>
  );
}
