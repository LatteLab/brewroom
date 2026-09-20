import { auth } from '@/auth';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getInboundEmailDetailAction, getRepliesForInboundAction } from '@/app/actions/inbound-email';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import { sanitize } from '@/lib/sanitize';
import { InboundReplyForm } from '@/components/admin/email/inbound-reply-form';

const REPLY_STATUS_BADGE: Record<string, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  queued:    { label: 'Queued',    className: 'bg-stone-100 text-stone-700',          icon: Clock },
  sending:   { label: 'Sending',   className: 'bg-blue-100 text-blue-800',            icon: Clock },
  sent:      { label: 'Sent',      className: 'bg-amber-100 text-amber-800',          icon: CheckCircle2 },
  delivered: { label: 'Delivered', className: 'bg-green-100 text-green-800',          icon: CheckCircle2 },
  bounced:   { label: 'Bounced',   className: 'bg-red-100 text-red-800',              icon: AlertTriangle },
  failed:    { label: 'Failed',    className: 'bg-red-100 text-red-800',              icon: AlertTriangle },
};

export default async function AdminInboundDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (!session.user.isAdmin) redirect('/user');

  const { id } = await params;
  const [row, replies] = await Promise.all([
    getInboundEmailDetailAction(id),
    getRepliesForInboundAction(id),
  ]);
  if (!row) notFound();

  const recipientLabel = row.fromName ? `${row.fromName} <${row.fromEmail}>` : row.fromEmail;
  const defaultSubject = row.subject
    ? row.subject.toLowerCase().startsWith('re:')
      ? row.subject
      : `Re: ${row.subject}`
    : 'Re: (no subject)';
  const attachments = (row.attachmentsMeta ?? []) as Array<{
    filename: string;
    contentType: string;
    size: number;
  }>;

  return (
    <>
      <PageHeader title="Inbound email" showSidebarTrigger />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-6 space-y-6">
          <Link href="/admin/email/inbox" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to inbox
          </Link>

          {/* Original message header */}
          <div className="rounded-md border bg-card p-5">
            <h1 className="text-lg font-semibold">{row.subject ?? <span className="text-muted-foreground italic">(no subject)</span>}</h1>
            <div className="mt-2 text-sm text-muted-foreground">
              From <span className="text-foreground">{row.fromName ?? row.fromEmail}</span>
              {row.fromName && <span> ({row.fromEmail})</span>}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              To {row.toEmail} - {new Date(row.createdAt).toLocaleString()}
            </div>
            <div className="mt-3">
              <Badge variant="secondary">{row.threadingSource.replace('_', ' ')}</Badge>
            </div>
          </div>

          {/* Original body */}
          {row.bodyHtml ? (
            <div
              className="rounded-md border bg-card p-5 prose prose-stone dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: sanitize(row.bodyHtml) }}
            />
          ) : (
            <pre className="rounded-md border bg-card p-5 text-sm whitespace-pre-wrap font-sans">
              {row.bodyText ?? '(empty)'}
            </pre>
          )}

          {attachments.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold mb-2">Attachments</h2>
              <ul className="text-xs text-muted-foreground list-disc pl-5">
                {attachments.map((a, i) => (
                  <li key={i}>
                    {a.filename} ({a.contentType}, {Math.round(a.size / 1024)} KB)
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Reply history */}
          {replies.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold mb-2">Your replies</h2>
              <div className="rounded-md border divide-y">
                {replies.map((r) => {
                  const meta = REPLY_STATUS_BADGE[r.status] ?? REPLY_STATUS_BADGE.queued;
                  return (
                    <div key={r.id} className="px-4 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm truncate" title={r.subject}>{r.subject}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(r.sentAt ?? r.createdAt).toLocaleString()}
                        </div>
                        {r.lastError && (
                          <div className="mt-1 text-xs text-red-600 max-w-md truncate" title={r.lastError}>
                            {r.lastError}
                          </div>
                        )}
                      </div>
                      <Badge variant="secondary" className={meta.className}>
                        <meta.icon className="h-3 w-3 mr-1" /> {meta.label}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Reply form */}
          <div>
            <h2 className="text-sm font-semibold mb-2">Reply</h2>
            <InboundReplyForm
              inboundId={row.id}
              recipientLabel={recipientLabel}
              defaultSubject={defaultSubject}
            />
          </div>
        </div>
      </div>
    </>
  );
}
