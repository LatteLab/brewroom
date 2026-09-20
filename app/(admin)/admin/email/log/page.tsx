import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { getEmailLogAction, getEmailLogStatsAction } from '@/app/actions/email-log';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { EmailLogRowActions } from '@/components/admin/email/email-log-row-actions';
import { CheckCircle2, XCircle, Clock, AlertTriangle } from 'lucide-react';

const STATUS_BADGE: Record<string, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  queued:    { label: 'Queued',    className: 'bg-stone-100 text-stone-700',          icon: Clock },
  sending:   { label: 'Sending',   className: 'bg-blue-100 text-blue-800',            icon: Clock },
  sent:      { label: 'Sent',      className: 'bg-amber-100 text-amber-800',          icon: CheckCircle2 },
  delivered: { label: 'Delivered', className: 'bg-green-100 text-green-800',          icon: CheckCircle2 },
  bounced:   { label: 'Bounced',   className: 'bg-red-100 text-red-800',              icon: AlertTriangle },
  failed:    { label: 'Failed',    className: 'bg-red-100 text-red-800',              icon: XCircle },
};

export default async function AdminEmailLogPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (!session.user.isAdmin) redirect('/user');

  const [rows, stats] = await Promise.all([
    getEmailLogAction({}, 200),
    getEmailLogStatsAction(),
  ]);

  return (
    <>
      <PageHeader title="Email log" showSidebarTrigger />

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-6 mx-auto max-w-6xl">
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 mb-6">
            <StatBox label="Total" value={stats.total} />
            <StatBox label="Sent" value={stats.sent} />
            <StatBox label="Delivered" value={stats.delivered} />
            <StatBox label="Failed" value={stats.failed} />
            <StatBox label="Bounced" value={stats.bounced} />
            <StatBox label="Queued" value={stats.queued} />
          </div>

          {rows.length === 0 ? (
            <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
              No transactional emails yet.
            </div>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">When</th>
                      <th className="px-3 py-2 font-medium">Template</th>
                      <th className="px-3 py-2 font-medium">Recipient</th>
                      <th className="px-3 py-2 font-medium">Subject</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Attempts</th>
                      <th className="px-3 py-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const meta = STATUS_BADGE[r.status] ?? STATUS_BADGE.queued;
                      return (
                        <tr key={r.id} className="border-t">
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">
                            {new Date(r.createdAt).toLocaleString()}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs">{r.template ?? <span className="text-muted-foreground">-</span>}</td>
                          <td className="px-3 py-2">
                            <div className="text-stone-900 dark:text-stone-100">{r.recipientName ?? r.recipientEmail}</div>
                            {r.recipientName && (
                              <div className="text-xs text-muted-foreground">{r.recipientEmail}</div>
                            )}
                          </td>
                          <td className="px-3 py-2 max-w-[260px] truncate" title={r.subject}>
                            {r.subject}
                          </td>
                          <td className="px-3 py-2">
                            <Badge variant="secondary" className={meta.className}>
                              <meta.icon className="h-3 w-3 mr-1" /> {meta.label}
                            </Badge>
                            {r.lastError && (
                              <div className="mt-1 text-xs text-red-600 max-w-[260px] truncate" title={r.lastError}>
                                {r.lastError}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs">{r.attemptCount}</td>
                          <td className="px-3 py-2 text-right">
                            <EmailLogRowActions rowId={r.id} status={r.status} />
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

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-card px-3 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
