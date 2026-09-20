'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, X } from 'lucide-react';

const statusColors: Record<string, string> = {
  open: 'bg-green-500/10 text-green-500 border-green-500/20',
  closed: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  completed: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  cancelled: 'bg-red-500/10 text-red-500 border-red-500/20',
};

interface EventWithCount {
  event: {
    id: string;
    name: string;
    date: Date;
    endDate: Date | null;
    location: string | null;
    capacity: number;
    status: string;
    visibility: string;
  };
  registrationCount: number;
}

function formatTimeRange(date: Date, endDate: Date | null): string {
  const start = new Date(date);
  const dateStr = start.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const startTime = start.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
  if (!endDate) return `${dateStr}, ${startTime}`;
  const end = new Date(endDate);
  const endTime = end.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${dateStr}, ${startTime} - ${endTime}`;
}

const filterTabs = [
  { label: 'Upcoming', value: 'upcoming' },
  { label: 'Past', value: 'past' },
] as const;

type Filter = 'upcoming' | 'past';

interface AdminEventListProps {
  events: EventWithCount[];
}

export function AdminEventList({ events }: AdminEventListProps) {
  const [filter, setFilter] = useState<Filter>('upcoming');
  const [search, setSearch] = useState('');

  const now = useMemo(() => new Date(), []);

  const filtered = useMemo(() => {
    const byTime = events.filter((item) =>
      filter === 'upcoming'
        ? new Date(item.event.date) >= now
        : new Date(item.event.date) < now
    );

    // upcoming: soonest first, past: most recent first
    byTime.sort((a, b) => {
      const aTime = new Date(a.event.date).getTime();
      const bTime = new Date(b.event.date).getTime();
      return filter === 'upcoming' ? aTime - bTime : bTime - aTime;
    });

    if (!search) return byTime;
    const q = search.toLowerCase();
    return byTime.filter(
      (item) =>
        item.event.name.toLowerCase().includes(q) ||
        (item.event.location?.toLowerCase().includes(q) ?? false)
    );
  }, [events, filter, search, now]);

  return (
    <div className="space-y-4">
      {/* Filter toggle */}
      <div className="relative flex w-fit items-center rounded-full bg-muted p-0.5">
        {filterTabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setFilter(tab.value)}
            className={`relative z-10 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              filter === tab.value
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {filter === tab.value && (
              <motion.span
                layoutId="admin-event-filter-pill"
                className="absolute inset-0 rounded-full bg-card shadow-sm"
                transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
              />
            )}
            <span className="relative z-10">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search events..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 pr-9"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Event list */}
      {filtered.length > 0 ? (
        <div className="space-y-1.5">
          {filtered.map(({ event, registrationCount }) => (
            <Link key={event.id} href={`/admin/events/${event.id}`}>
              <div className="flex items-center justify-between rounded-lg border px-3 py-2.5 transition-colors hover:bg-muted/50">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{event.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatTimeRange(event.date, event.endDate)}
                    {event.location && ` - ${event.location}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <span className="text-xs text-muted-foreground">
                    {registrationCount} / {event.capacity}
                  </span>
                  <Badge variant="outline" className={`text-xs ${statusColors[event.status] || ''}`}>
                    {event.status}
                  </Badge>
                  <Badge variant="outline" className="text-xs">{event.visibility}</Badge>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : search ? (
        <div className="py-20 text-center text-muted-foreground">
          <p>No events matching &ldquo;{search}&rdquo;</p>
          <Button variant="ghost" className="mt-2" onClick={() => setSearch('')}>
            Clear search
          </Button>
        </div>
      ) : (
        <div className="py-20 text-center text-muted-foreground">
          <p>{filter === 'upcoming' ? 'No upcoming events.' : 'No past events.'}</p>
          {filter === 'upcoming' && (
            <Link href="/admin/events/new">
              <Button className="mt-4">Create Event</Button>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
