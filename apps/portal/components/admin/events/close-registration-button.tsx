'use client';

import { Button } from '@/components/ui/button';
import { closeRegistration } from '@/app/actions/events';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Lock } from 'lucide-react';

export function CloseRegistrationButton({ eventId }: { eventId: string }) {
  const [isPending, startTransition] = useTransition();

  const handleClose = () => {
    startTransition(async () => {
      try {
        await closeRegistration(eventId);
        toast.success('Registration closed');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to close registration');
      }
    });
  };

  return (
    <Button variant="outline" onClick={handleClose} disabled={isPending} className="gap-2">
      <Lock className="h-4 w-4" />
      {isPending ? 'Closing...' : 'Close Registration'}
    </Button>
  );
}
