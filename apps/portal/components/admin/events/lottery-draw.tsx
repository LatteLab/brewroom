'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { runLotteryDraft } from '@/app/actions/events';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Sparkles } from 'lucide-react';

export function LotteryDraw({ eventId, entrantCount }: { eventId: string; entrantCount: number }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleDraw = () => {
    startTransition(async () => {
      try {
        await runLotteryDraft(eventId);
        setShowConfirm(false);
        toast.success('Lottery draft created — review results before finalizing');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Lottery failed');
        setShowConfirm(false);
      }
    });
  };

  return (
    <>
      <Button
        onClick={() => setShowConfirm(true)}
        disabled={entrantCount === 0}
        size="sm"
        className="gap-2"
      >
        <Sparkles className="h-3.5 w-3.5" />
        Run Lottery ({entrantCount} eligible)
      </Button>

      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Run Lottery Draw</DialogTitle>
            <DialogDescription>
              This will create a draft selection from {entrantCount} eligible registrations using weighted random selection.
              You&apos;ll be able to review, remove, and re-roll before finalizing.
              Priority scores: base 1.0, +0.5 per semester loss, -0.75 per semester win, -1.5 per no-show.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirm(false)}>Cancel</Button>
            <Button onClick={handleDraw} disabled={isPending}>
              {isPending ? 'Drawing...' : 'Create Draft'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
