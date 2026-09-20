import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import { getEventById, getEventRegistrations, getAcceptedPairingsForEvent, getEventPhotos } from "@/lib/db/event-queries";
import { PageHeader } from "@/components/ui/page-header";
import { EventManagementTabs } from "@/components/admin/events/event-management-tabs";

export default async function AdminEventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!session.user.isAdmin) redirect("/user");

  const { id } = await params;
  const event = await getEventById(id);
  if (!event) notFound();

  const [registrations, pairings, photos] = await Promise.all([
    getEventRegistrations(id, { withStats: true }),
    event.plusOneEnabled ? getAcceptedPairingsForEvent(id) : Promise.resolve([]),
    getEventPhotos(id),
  ]);

  return (
    <>
      <PageHeader title={event.name} showSidebarTrigger />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-4 py-6">
          <EventManagementTabs event={event} registrations={registrations} pairings={pairings} photos={photos} />
        </div>
      </div>
    </>
  );
}
