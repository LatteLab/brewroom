import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { getUserEvents } from '@/lib/db/event-queries';
import { EventTimeline } from '@/components/user/event-timeline';
import { EventFilterToggle } from '@/components/user/event-filter-toggle';
import { Calendar } from 'lucide-react';

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const params = await searchParams;
  const filter = (params.filter as 'upcoming' | 'past') || 'upcoming';
  const events = await getUserEvents(session.user.id, filter);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Events</h1>

          {/* Pill toggle */}
          <EventFilterToggle active={filter} />
        </div>

        {/* Timeline or empty state */}
        {events.length > 0 ? (
          <EventTimeline events={events} />
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Calendar className="mb-4 h-16 w-16 text-muted-foreground/30" />
            <h3 className="text-lg font-semibold">No events yet</h3>
            <p className="mt-1 text-muted-foreground">
              {filter === 'past'
                ? 'You haven\u2019t attended any events yet.'
                : 'Register for events to see them here.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
