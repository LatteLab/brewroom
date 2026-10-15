import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { getPublishedEvents, getRegistrationCount, getUserRegistration } from '@/lib/db/event-queries';
import { EventTimeline } from '@/components/user/event-timeline';
import { Calendar } from 'lucide-react';

export default async function DiscoverPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const events = await getPublishedEvents('upcoming');

  const eventsWithDetails = await Promise.all(
    events.map(async (event) => {
      const [registeredCount, registration] = await Promise.all([
        getRegistrationCount(event.id, ['registered', 'selected', 'checked_in']),
        getUserRegistration(session.user!.id, event.id),
      ]);
      return {
        event,
        registrationStatus: registration?.status ?? null,
        registeredCount,
      };
    })
  );

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Discover</h1>
          <p className="mt-1 text-sm text-muted-foreground">Browse upcoming events</p>
        </div>

        {eventsWithDetails.length > 0 ? (
          <EventTimeline events={eventsWithDetails} />
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Calendar className="mb-4 h-16 w-16 text-muted-foreground/30" />
            <h3 className="text-lg font-semibold">No upcoming events</h3>
            <p className="mt-1 text-muted-foreground">
              Check back soon for new events.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
