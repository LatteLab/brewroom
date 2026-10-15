import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { EventForm } from "@/components/admin/events/event-form";

export default async function NewEventPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!session.user.isAdmin) redirect("/user");

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-5">
        <EventForm />
      </div>
    </div>
  );
}
