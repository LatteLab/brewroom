'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { Loader2, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { retryEmailLogRowAction } from '@/app/actions/email-log';

export function EmailLogRowActions({ rowId, status }: { rowId: string; status: string }) {
  const [pending, start] = useTransition();
  const retryable = status === 'failed' || status === 'queued';
  if (!retryable) return null;

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          try {
            const r = await retryEmailLogRowAction(rowId);
            if (r.status === 'sent') toast.success('Resent successfully');
            else if (r.status === 'failed') toast.error('Retry failed - check log entry');
            else toast.info(`Status: ${r.status}`);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Retry failed');
          }
        })
      }
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
      <span className="ml-1.5">Retry</span>
    </Button>
  );
}
