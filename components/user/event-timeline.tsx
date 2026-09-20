'use client';

import type { Event } from '@/lib/db/schema';
import { TimelineEventCard } from './event-card';

interface EventTimelineProps {
  events: Array<{
    event: Event;
    registrationStatus: string | null;
    registeredCount: number;
    photoCount?: number;
  }>;
}

interface DateGroup {
  key: string;
  label: string;
  dayName: string;
  events: EventTimelineProps['events'];
}

function getDateLabel(date: Date): { label: string; dayName: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });

  if (diffDays === 0) return { label: 'Today', dayName };
  if (diffDays === 1) return { label: 'Tomorrow', dayName };
  if (diffDays === -1) return { label: 'Yesterday', dayName };

  const label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return { label, dayName };
}

function groupEventsByDate(events: EventTimelineProps['events']): DateGroup[] {
  const groups = new Map<string, DateGroup>();

  for (const item of events) {
    const d = new Date(item.event.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    if (!groups.has(key)) {
      const { label, dayName } = getDateLabel(d);
      groups.set(key, { key, label, dayName, events: [] });
    }
    groups.get(key)!.events.push(item);
  }

  return Array.from(groups.values());
}

export function EventTimeline({ events }: EventTimelineProps) {
  const dateGroups = groupEventsByDate(events);

  return (
    <div className="space-y-6 md:space-y-0">
      {dateGroups.map((group, groupIndex) => (
        <div key={group.key}>
          {/* === Mobile / Compact layout === */}
          <div className="md:hidden">
            {/* Date header row */}
            <div className="mb-3 flex items-center gap-3">
              <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-muted-foreground/30" />
              <span className="text-sm font-semibold">{group.label}</span>
              <span className="text-sm text-muted-foreground">{group.dayName}</span>
            </div>

            {/* Cards */}
            <div className="ml-[22px] space-y-3">
              {group.events.map((item) => (
                <TimelineEventCard
                  key={item.event.id}
                  event={item.event}
                  registrationStatus={item.registrationStatus}
                  registeredCount={item.registeredCount}
                  photoCount={item.photoCount}
                />
              ))}
            </div>
          </div>

          {/* === Desktop / Wide layout === */}
          <div className="hidden md:grid md:grid-cols-[80px_24px_1fr] md:gap-x-2">
            {/* Left: sticky date label */}
            <div className="sticky top-14 z-10 self-start pt-1 text-right">
              <p className="text-sm font-semibold leading-tight">{group.label}</p>
              <p className="text-xs text-muted-foreground">{group.dayName}</p>
            </div>

            {/* Center: static lines + sticky dot */}
            <div className="relative">
              {/* Line above dot (all groups except first) */}
              {groupIndex > 0 && (
                <div className="absolute top-0 left-1/2 h-[10px] w-px -translate-x-1/2 bg-border" />
              )}
              {/* Line below dot (all groups except last) */}
              {groupIndex < dateGroups.length - 1 && (
                <div className="absolute bottom-0 left-1/2 top-[18px] w-px -translate-x-1/2 bg-border" />
              )}
              {/* Sticky dot */}
              <div className="sticky top-14 z-10 flex self-start justify-center pt-2">
                <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-muted-foreground/40 ring-2 ring-background" />
              </div>
            </div>

            {/* Right: event cards */}
            <div className="space-y-2 pb-8">
              {group.events.map((item) => (
                <TimelineEventCard
                  key={item.event.id}
                  event={item.event}
                  registrationStatus={item.registrationStatus}
                  registeredCount={item.registeredCount}
                  photoCount={item.photoCount}
                />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
