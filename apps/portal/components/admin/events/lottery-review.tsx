'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  removeDraftSelected,
  promoteDraftRejected,
  rerollLottery,
  finalizeLottery,
  discardLotteryDraft,
} from '@/app/actions/events';
import { toast } from 'sonner';
import { X, Plus, RefreshCw, Check, Undo2, AlertTriangle } from 'lucide-react';
import type { Registration } from '@/lib/types/event';

export function LotteryReview({
  eventId,
  capacity,
  registrations,
}: {
  eventId: string;
  capacity: number;
  registrations: Registration[];
}) {
  const [showFinalize, setShowFinalize] = useState(false);
  const [showDiscard, setShowDiscard] = useState(false);
  const [isPending, startTransition] = useTransition();

  const draftSelected = registrations.filter(r => r.registration.status === 'draft_selected');
  const draftRejected = registrations.filter(r => r.registration.status === 'draft_rejected');
  const confirmedCount = registrations.filter(r =>
    ['registered', 'selected', 'checked_in'].includes(r.registration.status)
  ).length;
  const totalSlots = Math.max(0, capacity - confirmedCount);
  const openSlots = Math.max(0, totalSlots - draftSelected.length);
  const rerollCount = Math.min(openSlots, draftRejected.length);

  const handleRemove = (registrationId: string) => {
    startTransition(async () => {
      try {
        await removeDraftSelected(registrationId, eventId);
        toast.success('Removed from selected');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to remove');
      }
    });
  };

  const handlePromote = (registrationId: string) => {
    startTransition(async () => {
      try {
        await promoteDraftRejected(registrationId, eventId);
        toast.success('Added to selected');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to promote');
      }
    });
  };

  const handleReroll = () => {
    startTransition(async () => {
      try {
        const result = await rerollLottery(eventId);
        if (result.noOpenSlots) {
          toast.info('All slots are filled — remove a selection first to re-roll');
        } else if (result.newlySelected.length === 0) {
          toast.info('No candidates remaining to fill open slots');
        } else {
          toast.success(`Re-rolled: ${result.newlySelected.length} new selection(s)`);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Re-roll failed');
      }
    });
  };

  const handleFinalize = () => {
    startTransition(async () => {
      try {
        await finalizeLottery(eventId);
        setShowFinalize(false);
        toast.success('Lottery finalized');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Finalize failed');
        setShowFinalize(false);
      }
    });
  };

  const handleDiscard = () => {
    startTransition(async () => {
      try {
        await discardLotteryDraft(eventId);
        setShowDiscard(false);
        toast.success('Lottery draft discarded');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Discard failed');
        setShowDiscard(false);
      }
    });
  };

  return (
    <div className="space-y-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <h3 className="text-sm font-semibold text-amber-600">Lottery Draft — Review Before Finalizing</h3>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReroll}
            disabled={isPending || openSlots <= 0 || draftRejected.length === 0}
            title={openSlots <= 0 ? 'All slots filled — remove a selection to re-roll' : undefined}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Re-roll{rerollCount > 0 ? ` (${rerollCount})` : ''}
          </Button>
          <Button
            size="sm"
            onClick={() => setShowFinalize(true)}
            disabled={isPending}
          >
            <Check className="h-3.5 w-3.5 mr-1.5" />
            Finalize
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDiscard(true)}
            disabled={isPending}
          >
            <Undo2 className="h-3.5 w-3.5 mr-1.5" />
            Discard
          </Button>
        </div>
      </div>

      {/* Selected */}
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <h4 className="text-sm font-medium text-green-600">
            Selected ({draftSelected.length})
          </h4>
          <span className="text-xs text-muted-foreground">
            {draftSelected.length} of {totalSlots} slots filled
          </span>
        </div>
        {draftSelected.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">No selections — use Re-roll to fill slots.</p>
        ) : (
          <div className="space-y-1">
            {draftSelected.map(({ registration, user, stats }) => (
              <div key={registration.id} className="flex items-center justify-between rounded-lg border bg-background p-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar className="h-7 w-7">
                    <AvatarImage src={user.image || undefined} />
                    <AvatarFallback className="text-xs">
                      {user.name?.split(' ').map(n => n[0]).join('') || '?'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{user.name || 'Unknown'}</p>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  </div>
                  {stats && (
                    <div className="flex items-center gap-2 ml-2">
                      {stats.noShowCount > 0 && (
                        <Badge variant="outline" className="text-xs bg-red-500/10 text-red-500 border-red-500/20">
                          {stats.noShowCount} NS
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">{stats.eventsAttended} attended</span>
                      {(stats.semesterLotteryWins > 0 || stats.semesterLotteryLosses > 0) && (
                        <span className="text-xs text-muted-foreground">
                          {stats.semesterLotteryWins}W / {stats.semesterLotteryLosses}L
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-2">
                  {registration.lotteryPriorityScore != null && (
                    <span className="text-xs text-muted-foreground">
                      Score: {registration.lotteryPriorityScore.toFixed(1)}
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-500/10"
                    onClick={() => handleRemove(registration.id)}
                    disabled={isPending}
                    title="Remove from selected"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Not Selected */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-2">
          Not Selected ({draftRejected.length})
        </h4>
        {draftRejected.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">All entrants were selected.</p>
        ) : (
          <div className="space-y-1">
            {draftRejected.map(({ registration, user, stats }) => (
              <div key={registration.id} className="flex items-center justify-between rounded-lg border bg-background p-2.5 opacity-60">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar className="h-7 w-7">
                    <AvatarImage src={user.image || undefined} />
                    <AvatarFallback className="text-xs">
                      {user.name?.split(' ').map(n => n[0]).join('') || '?'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{user.name || 'Unknown'}</p>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  </div>
                  {stats && (
                    <div className="flex items-center gap-2 ml-2">
                      {stats.noShowCount > 0 && (
                        <Badge variant="outline" className="text-xs bg-red-500/10 text-red-500 border-red-500/20">
                          {stats.noShowCount} NS
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">{stats.eventsAttended} attended</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-2">
                  {registration.lotteryPriorityScore != null && (
                    <span className="text-xs text-muted-foreground">
                      Score: {registration.lotteryPriorityScore.toFixed(1)}
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-500/10"
                    onClick={() => handlePromote(registration.id)}
                    disabled={isPending || openSlots <= 0}
                    title={openSlots <= 0 ? 'All slots filled' : 'Add to selected'}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Finalize dialog */}
      <Dialog open={showFinalize} onOpenChange={setShowFinalize}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finalize Lottery</DialogTitle>
            <DialogDescription>
              This will confirm {draftSelected.length} selected and {draftRejected.length} rejected.
              Lottery history will be recorded. You can run additional rounds later if spots open up.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFinalize(false)}>Cancel</Button>
            <Button onClick={handleFinalize} disabled={isPending}>
              {isPending ? 'Finalizing...' : 'Confirm Finalize'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Discard dialog */}
      <Dialog open={showDiscard} onOpenChange={setShowDiscard}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard Lottery Draft</DialogTitle>
            <DialogDescription>
              This will revert all {draftSelected.length + draftRejected.length} draft entries to their previous status.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDiscard(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDiscard} disabled={isPending}>
              {isPending ? 'Discarding...' : 'Discard Draft'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
