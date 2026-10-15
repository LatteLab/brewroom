'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { sendEmailBlastAction, deleteEmailBlastAction } from '@/app/actions/email';
import { toast } from 'sonner';
import { Pencil, Send, Trash2, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { sanitize } from '@/lib/sanitize';
import type { EmailBlast } from '@/lib/db/schema';
import type { RecipientWithUser } from '@/lib/types/email';
import { blastStatusColors, recipientStatusColors } from '@/lib/types/email';

interface EmailBlastDetailProps {
  blast: EmailBlast;
  recipients: RecipientWithUser[];
  senderName: string | null;
}

function audienceSummary(blast: EmailBlast): string {
  try {
    const filters = JSON.parse(blast.audienceFilters);
    switch (filters.type) {
      case 'all':
        return 'All Members';
      case 'event':
        return 'Event registrants';
      case 'semester_status':
        return filters.semesterStatus || 'Semester status';
      case 'manual': {
        const count = filters.userIds?.length || 0;
        return `${count} selected user${count !== 1 ? 's' : ''}`;
      }
      default:
        return blast.audienceType;
    }
  } catch {
    return blast.audienceType;
  }
}

export function EmailBlastDetail({ blast, recipients, senderName }: EmailBlastDetailProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const stats = {
    queued: recipients.filter((r) => r.status === 'queued').length,
    sent: recipients.filter((r) => r.status === 'sent').length,
    delivered: recipients.filter((r) => r.status === 'delivered').length,
    bounced: recipients.filter((r) => r.status === 'bounced').length,
    failed: recipients.filter((r) => r.status === 'failed').length,
  };

  const handleSend = () => {
    startTransition(async () => {
      try {
        await sendEmailBlastAction(blast.id);
        toast.success('Email blast sent successfully');
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to send blast');
      }
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      try {
        await deleteEmailBlastAction(blast.id);
        toast.success('Draft deleted');
        router.push('/admin/email');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to delete');
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Metadata */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className={blastStatusColors[blast.status] || ''}>
            {blast.status}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {audienceSummary(blast)}
          </span>
          {blast.sentAt && (
            <span className="text-sm text-muted-foreground">
              Sent {new Date(blast.sentAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </span>
          )}
          {senderName && (
            <span className="text-sm text-muted-foreground">
              by {senderName}
            </span>
          )}
        </div>

        {/* Draft actions */}
        {blast.status === 'draft' && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/admin/email/compose?blastId=${blast.id}`}>
                <Pencil className="h-4 w-4 mr-1.5" />
                Edit
              </Link>
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" disabled={isPending}>
                  {isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
                  Send Blast
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Send Email Blast?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will send the email to all recipients in the selected audience. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleSend}>Send Now</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={isPending}>
                  <Trash2 className="h-4 w-4 mr-1.5" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Draft?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete this email draft.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} variant="destructive">Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>

      {/* Delivery Stats */}
      {blast.status !== 'draft' && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: 'Queued', value: stats.queued, color: 'text-gray-600' },
            { label: 'Sent', value: stats.sent, color: 'text-blue-600' },
            { label: 'Delivered', value: stats.delivered, color: 'text-green-600' },
            { label: 'Bounced', value: stats.bounced, color: 'text-amber-600' },
            { label: 'Failed', value: stats.failed, color: 'text-red-600' },
          ].map((stat) => (
            <div key={stat.label} className="rounded-lg border p-3 text-center">
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Email Content Preview */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Content Preview</h3>
        <div
          className="rounded-lg border p-4 prose prose-sm dark:prose-invert max-w-none"
          dangerouslySetInnerHTML={{ __html: sanitize(blast.bodyTemplate || blast.body) }}
        />
      </div>

      {/* Recipients Table */}
      {recipients.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">
            Recipients ({recipients.length})
          </h3>
          <div className="space-y-1">
            {recipients.map((recipient) => (
              <div
                key={recipient.id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{recipient.userName || 'Unknown'}</p>
                  <p className="text-xs text-muted-foreground truncate">{recipient.email}</p>
                </div>
                <div className="flex items-center gap-2 ml-2">
                  {recipient.statusUpdatedAt && (
                    <span className="text-xs text-muted-foreground hidden sm:inline">
                      {new Date(recipient.statusUpdatedAt).toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </span>
                  )}
                  <Badge variant="outline" className={`text-xs ${recipientStatusColors[recipient.status] || ''}`}>
                    {recipient.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
