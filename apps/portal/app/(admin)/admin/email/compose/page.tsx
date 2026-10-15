import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { EmailComposer } from '@/components/admin/email/email-composer';

export default async function AdminEmailComposePage({
  searchParams,
}: {
  searchParams: Promise<{ audienceType?: string; eventId?: string; blastId?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (!session.user.isAdmin) redirect('/user');

  const { audienceType, eventId, blastId } = await searchParams;

  return (
    <>
      <PageHeader
        title={blastId ? 'Edit Draft' : 'Compose Email'}
        showSidebarTrigger
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link href="/admin/email">
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              All Emails
            </Link>
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-6">
          <EmailComposer
            initialAudienceType={audienceType}
            initialEventId={eventId}
            initialBlastId={blastId}
          />
        </div>
      </div>
    </>
  );
}
