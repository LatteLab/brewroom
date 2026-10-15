import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface PastEventStatusCardProps {
  registrationStatus: string | null;
  userName: string;
  userImage: string | null;
}

function getStatusMessage(status: string | null): { title: string; subtitle: string } {
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
}: PastEventStatusCardProps) {
  const { title, subtitle } = getStatusMessage(registrationStatus);
  const initials = userName
    .split(' ')
    .map((n) => n[0])
    .join('');

  return (
    <div className="rounded-xl border p-5 space-y-3">
      <Avatar className="h-10 w-10">
        <AvatarImage src={userImage || undefined} />
        <AvatarFallback className="text-xs">{initials || '?'}</AvatarFallback>
      </Avatar>
      <div>
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}
