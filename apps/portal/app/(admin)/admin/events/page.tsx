import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { getEvents, getRegistrationCount } from '@/lib/db/event-queries';
import { PageHeader } from '@/components/ui/page-header';
import { AdminEventList } from '@/components/admin/events/admin-event-list';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Plus } from 'lucide-react';

export default async function AdminEventsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (!session.user.isAdmin) redirect('/user');

  const events = await getEvents();

  const eventsWithCounts = await Promise.all(
    events.map(async (event) => {
      const count = await getRegistrationCount(event.id);
      return { event, registrationCount: count };
    })
  );

  return (
    <>
      <PageHeader
        title="Events"
        showSidebarTrigger
        actions={
          <Link href="/admin/events/new">
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" />
              New Event
            </Button>
          </Link>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-6">
          <AdminEventList events={eventsWithCounts} />
        </div>
      </div>
    </>
  );
}
