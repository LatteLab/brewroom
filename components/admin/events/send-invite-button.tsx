'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Mail, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { resendConfirmationEmailsAction } from '@/app/actions/events';
import type { Event } from '@/lib/db/schema';

interface Props {
  event: Event;
  emails: string[];
}

/**
 * Re-send confirmation emails to every confirmed registrant. Replaces the original mailto:
 * Outlook fallback now that transactional emails fire automatically. Useful as an admin escape
 * hatch when the auto-trigger criteria didn't fire (e.g., an event detail edit that didn't tick
 * "Notify registrants").
 */
export function SendInviteButton({ event, emails }: Props) {
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  const disabled = emails.length === 0 || isPending;

  const handleClick = () => {
    if (!confirming) {
      setConfirming(true);
      // Auto-reset after 4s if not clicked again
      setTimeout(() => setConfirming(false), 4000);
      return;
    }
    setConfirming(false);
    startTransition(async () => {
      try {
        const result = await resendConfirmationEmailsAction(event.id);
        toast.success(`Queued ${result.queued} confirmation email${result.queued === 1 ? '' : 's'}`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to send');
      }
    });
  };

  return (
    <Button
      variant={confirming ? 'destructive' : 'outline'}
      size="sm"
      onClick={handleClick}
      disabled={disabled}
      title={
        emails.length === 0
          ? 'No confirmed registrations yet'
          : confirming
          ? 'Click again to confirm - sends to every confirmed registrant'
          : `Re-send confirmation email to all ${emails.length} confirmed registrants`
      }
    >
      {isPending ? (
        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
      ) : (
        <Mail className="h-3.5 w-3.5 mr-1.5" />
      )}
      {confirming ? `Click again to send to ${emails.length}` : `Re-send confirmations${emails.length > 0 ? ` (${emails.length})` : ''}`}
    </Button>
  );
}
