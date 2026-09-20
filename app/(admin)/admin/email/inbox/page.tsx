import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getInboundEmailsAction, getInboundCountStatsAction } from '@/app/actions/inbound-email';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, AlertCircle } from 'lucide-react';

const SOURCE_LABEL: Record<string, { label: string; className: string }> = {
  reply_address: { label: 'Threaded (token)',  className: 'bg-green-100 text-green-800' },
  in_reply_to:   { label: 'Threaded (header)', className: 'bg-emerald-100 text-emerald-800' },
  references:    { label: 'Threaded (refs)',   className: 'bg-emerald-100 text-emerald-800' },
  manual:        { label: 'Threaded (manual)', className: 'bg-blue-100 text-blue-800' },
  none:          { label: 'Orphan',            className: 'bg-amber-100 text-amber-800' },
};

const FORWARD_LABEL: Record<string, { label: string; className: string }> = {
  sent: { label: 'Forwarded', className: 'bg-green-100 text-green-800' },
  failed: { label: 'Forward failed', className: 'bg-red-100 text-red-800' },
  not_attempted: { label: 'Not forwarded', className: 'bg-muted text-muted-foreground' },
};

export default async function AdminInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ blast?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (!session.user.isAdmin) redirect('/user');

  const params = await searchParams;
  const filters = params.blast ? { replyToBlastId: params.blast } : {};

  const [rows, stats] = await Promise.all([
    getInboundEmailsAction(filters, 200),
    getInboundCountStatsAction(),
  ]);

  return (
    <>
      <PageHeader title="Inbound replies" showSidebarTrigger />

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-6 mx-auto max-w-6xl">
          <div className="grid grid-cols-3 gap-3 mb-6">
            <StatBox label="Total received" value={stats.total} />
            <StatBox label="Threaded" value={stats.threaded} />
            <StatBox label="Orphan" value={stats.orphaned} icon={stats.orphaned > 0 ? AlertCircle : undefined} />
          </div>

          <p className="text-xs text-muted-foreground mb-4">
            Inbound replies are logged here and forwarded to the exec inbox. Admins can reply from
            a message detail page or continue from the forwarded mailbox.
          </p>
          {params.blast && (
            <p className="mb-4 text-xs text-muted-foreground">
              Showing replies for one email blast. <Link href="/admin/email/inbox" className="underline">Clear filter</Link>
            </p>
          )}

          {rows.length === 0 ? (
            <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
              No inbound emails yet.
            </div>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">When</th>
                      <th className="px-3 py-2 font-medium">From</th>
                      <th className="px-3 py-2 font-medium">Subject</th>
                      <th className="px-3 py-2 font-medium">Threading</th>
                      <th className="px-3 py-2 font-medium">Forward</th>
                      <th className="px-3 py-2 font-medium">Replying to</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const meta = SOURCE_LABEL[r.threadingSource] ?? SOURCE_LABEL.none;
                      const forward = FORWARD_LABEL[r.forwardStatus] ?? FORWARD_LABEL.not_attempted;
                      const replyingTo = r.eventName
                        ? `Event: ${r.eventName}`
                        : r.blastSubject
                        ? `Blast: ${r.blastSubject}`
                        : r.outboxSubject
                        ? `Email: ${r.outboxSubject}`
                        : '-';
                      return (
                        <tr key={r.id} className="border-t">
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">
                            {new Date(r.createdAt).toLocaleString()}
                          </td>
                          <td className="px-3 py-2">
                            <div>{r.fromName ?? r.fromEmail}</div>
                            {r.fromName && (
                              <div className="text-xs text-muted-foreground">{r.fromEmail}</div>
                            )}
                          </td>
                          <td className="px-3 py-2 max-w-[280px] truncate" title={r.subject ?? ''}>
                            <Link href={`/admin/email/inbox/${r.id}`} className="hover:underline">
                              {r.subject ?? <span className="text-muted-foreground italic">(no subject)</span>}
                            </Link>
                          </td>
                          <td className="px-3 py-2">
                            <Badge variant="secondary" className={meta.className}>
                              <MessageSquare className="h-3 w-3 mr-1" />{meta.label}
                            </Badge>
                          </td>
                          <td className="px-3 py-2">
                            <Badge
                              variant="secondary"
                              className={forward.className}
                              title={r.forwardedTo ? `${forward.label}: ${r.forwardedTo}` : forward.label}
                            >
                              {r.forwardStatus === 'failed' && <AlertCircle className="h-3 w-3 mr-1" />}
                              {forward.label}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground max-w-[200px] truncate">
                            {replyingTo}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function StatBox({ label, value, icon: Icon }: { label: string; value: number; icon?: typeof AlertCircle }) {
  return (
    <div className="rounded-md border bg-card px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
