import { auth } from '@/auth';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getEmailBlastDetailAction } from '@/app/actions/email';
import { getInboundCountForBlastAction } from '@/app/actions/inbound-email';
import { PageHeader } from '@/components/ui/page-header';
import { EmailBlastDetail } from '@/components/admin/email/email-blast-detail';

export default async function AdminEmailDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (!session.user.isAdmin) redirect('/user');

  const { id } = await params;
  const [result, replyCount] = await Promise.all([
    getEmailBlastDetailAction(id),
    getInboundCountForBlastAction(id).catch(() => 0),
  ]);
  if (!result) notFound();

  return (
    <>
      <PageHeader
        title={result.blast.subject}
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
        <div className="mx-auto max-w-4xl px-4 py-6">
          {replyCount > 0 && (
            <Link
              href={`/admin/email/inbox?blast=${id}`}
              className="mb-4 inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-xs hover:bg-muted"
            >
              <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{replyCount} repl{replyCount === 1 ? 'y' : 'ies'} received</span>
            </Link>
          )}
          <EmailBlastDetail blast={result.blast} recipients={result.recipients} senderName={result.senderName} />
        </div>
      </div>
    </>
  );
}
