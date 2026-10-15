import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import { getEventById, getCheckinAttendees } from "@/lib/db/event-queries";
import { CheckinList } from "@/components/admin/events/checkin-list";

export default async function CheckinPage({
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

  const attendees = await getCheckinAttendees(id);

  return (
    <div className="flex h-screen flex-col">
      <CheckinList
        attendees={attendees}
        eventId={id}
        eventName={event.name}
        eventDate={event.date}
        eventStatus={event.status}
        questions={event.questions ?? null}
      />
    </div>
  );
}
