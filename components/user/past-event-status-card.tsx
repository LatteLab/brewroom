import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Ban } from 'lucide-react';

interface PastEventStatusCardProps {
  registrationStatus: string | null;
  userName: string;
  userImage: string | null;
  /** When true, the event was actively cancelled (not just past). Drives different copy. */
  isCancelled?: boolean;
}

function getStatusMessage(status: string | null, isCancelled?: boolean): { title: string; subtitle: string } {
  if (isCancelled) {
    switch (status) {
      case 'checked_in':
      case 'registered':
      case 'selected':
      case 'waitlisted':
      case 'pending_approval':
        return {
          title: 'Event Cancelled',
          subtitle: 'This event was cancelled. The exec team has been notified - reply to your cancellation email if you have questions.',
        };
      default:
        return {
          title: 'Event Cancelled',
          subtitle: 'This event was cancelled.',
        };
    }
  }
  switch (status) {
    case 'checked_in':
    case 'registered':
    case 'selected':
      return {
        title: 'Thank You for Joining',
        subtitle: 'We hope you enjoyed the event!',
      };
    case 'pending_approval':
      return {
        title: 'Pending Approval',
        subtitle: 'This event has ended. See you next time!',
      };
    case 'waitlisted':
      return {
        title: 'On the Waitlist',
        subtitle: 'This event has ended. See you next time!',
      };
    default:
      return {
        title: 'Event Ended',
        subtitle: 'This event has ended. See you next time!',
      };
  }
}

export function PastEventStatusCard({
  registrationStatus,
  userName,
  userImage,
  isCancelled,
}: PastEventStatusCardProps) {
  const { title, subtitle } = getStatusMessage(registrationStatus, isCancelled);
  const initials = userName
    .split(' ')
    .map((n) => n[0])
    .join('');

  return (
    <div className={`rounded-xl border p-5 space-y-3 ${isCancelled ? 'border-red-200 bg-red-50/50 dark:border-red-900/40 dark:bg-red-950/20' : ''}`}>
      {isCancelled ? (
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/40">
          <Ban className="h-5 w-5 text-red-600 dark:text-red-400" />
        </div>
      ) : (
        <Avatar className="h-10 w-10">
          <AvatarImage src={userImage || undefined} />
          <AvatarFallback className="text-xs">{initials || '?'}</AvatarFallback>
        </Avatar>
      )}
      <div>
        <p className={`font-semibold ${isCancelled ? 'text-red-700 dark:text-red-400' : ''}`}>{title}</p>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}
