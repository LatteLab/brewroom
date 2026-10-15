import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { getEmailBlastsAction } from '@/app/actions/email';
import { PageHeader } from '@/components/ui/page-header';
import { EmailBlastList } from '@/components/admin/email/email-blast-list';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Plus } from 'lucide-react';

export default async function AdminEmailPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (!session.user.isAdmin) redirect('/user');

  const blasts = await getEmailBlastsAction();

  return (
    <>
      <PageHeader
        title="Email"
        showSidebarTrigger
        actions={
          <Link href="/admin/email/compose">
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Compose
            </Button>
          </Link>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-6">
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            This feature is a work in progress. Resend API requires a verified domain we own before emails can be sent to recipients. This must be configured before finalizing this feature.
          </div>
          <EmailBlastList blasts={blasts} />
        </div>
      </div>
    </>
  );
}
