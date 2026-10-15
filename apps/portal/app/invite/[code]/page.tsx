import { auth } from '@/auth';
import { redirect, notFound } from 'next/navigation';
import { getEventByInviteCode, createEventAccess } from '@/lib/db/event-queries';

export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const event = await getEventByInviteCode(code);
  if (!event) notFound();

  const session = await auth();
  if (!session?.user) {
    redirect(`/login?callbackUrl=/invite/${code}`);
  }

  await createEventAccess(session.user.id, event.id);
  redirect(`/user/events/${event.id}`);
}
