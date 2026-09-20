'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { registerForEvent, cancelRegistration } from '@/app/actions/events';
import { toast } from 'sonner';
import { RegistrationQuestionnaireModal } from '@/components/user/registration-questionnaire-modal';
import type { Event, EventRegistration } from '@/lib/db/schema';
import type { QuestionnaireAnswers } from '@/lib/types/event';

interface Props {
  event: Event;
  registration: EventRegistration | null;
  spotsRemaining: number;
  /** If the user is in an accepted +1 pairing, info about their partner. */
  partnerInfo?: { name: string | null } | null;
}

export function EventRegistrationButton({ event, registration, spotsRemaining, partnerInfo }: Props) {
  const [isPending, startTransition] = useTransition();
  const [modalOpen, setModalOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);

  const hasQuestions = (event.questions?.length ?? 0) > 0;

  function doRegister(answers?: QuestionnaireAnswers) {
    startTransition(async () => {
      try {
        await registerForEvent(event.id, answers);
        if (event.requireApproval) {
          toast.success('Application submitted! Waiting for approval.');
        } else if (spotsRemaining > 0) {
          toast.success("You're registered!");
        } else {
          toast.success('Added to waitlist!');
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Registration failed');
      }
    });
  }

  const handleRegisterClick = () => {
    if (hasQuestions) {
      setModalOpen(true);
    } else {
      doRegister();
    }
  };

  const handleCancelClick = () => {
    if (partnerInfo) {
      setCancelDialogOpen(true);
    } else {
      doCancel('me');
    }
  };

  const doCancel = (scope: 'me' | 'both') => {
    startTransition(async () => {
      try {
        await cancelRegistration(event.id, scope);
        toast.success(scope === 'both' ? 'Both registrations cancelled' : 'Registration cancelled');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to cancel');
      }
    });
  };

  // Already has a registration record
  if (registration) {
    const statusLabels: Record<string, string> = {
      registered: "You're In",
      waitlisted: "You're on the Waitlist",
      selected: "You've Been Selected",
      rejected: 'Not Selected',
      checked_in: 'Checked In',
      no_show: 'Marked as No-Show',
      pending_approval: 'Pending Approval',
      draft_selected: 'Pending Review',
      draft_rejected: 'Pending Review',
    };

    const canCancel = ['registered', 'waitlisted', 'pending_approval'].includes(registration.status);

    return (
      <div className="space-y-2">
        <Button
          size="lg"
          className="w-full rounded-xl text-lg"
          variant={
            registration.status === 'rejected' || registration.status === 'no_show'
              ? 'destructive'
              : registration.status === 'pending_approval' ||
                  registration.status === 'draft_selected' ||
                  registration.status === 'draft_rejected'
                ? 'secondary'
                : 'default'
          }
          disabled
        >
          {statusLabels[registration.status] || registration.status}
        </Button>
        {canCancel && (
          <>
            <Button
              variant="outline"
              size="sm"
              className="w-full rounded-xl"
              onClick={handleCancelClick}
              disabled={isPending}
            >
              {registration.status === 'pending_approval' ? 'Cancel Request' : 'Cancel Registration'}
            </Button>
            {partnerInfo && (
              <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Cancel Registration</DialogTitle>
                    <DialogDescription>
                      You are paired with {partnerInfo.name || 'a +1'}. Would you like to cancel just your registration, or cancel for both of you?
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      variant="outline"
                      className="flex-1"
                      disabled={isPending}
                      onClick={() => { setCancelDialogOpen(false); doCancel('me'); }}
                    >
                      Just me
                    </Button>
                    <Button
                      variant="destructive"
                      className="flex-1"
                      disabled={isPending}
                      onClick={() => { setCancelDialogOpen(false); doCancel('both'); }}
                    >
                      Both of us
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </>
        )}
      </div>
    );
  }

  // Event closed, completed, or cancelled
  if (event.status === 'cancelled') {
    return (
      <Button size="lg" className="w-full rounded-xl text-lg" disabled>
        Event Cancelled
      </Button>
    );
  }
  if (event.status === 'closed' || event.status === 'completed') {
    return (
      <Button size="lg" className="w-full rounded-xl text-lg" disabled>
        Event Closed
      </Button>
    );
  }

  // Determine button label
  let buttonLabel = 'RSVP';
  if (event.requireApproval) {
    buttonLabel = 'One-Click Apply';
  } else if (spotsRemaining <= 0 && event.waitlistEnabled) {
    buttonLabel = 'Join Waitlist';
  }

  // FCFS full, no waitlist
  if (!event.requireApproval && spotsRemaining <= 0 && !event.waitlistEnabled) {
    return (
      <Button size="lg" className="w-full rounded-xl text-lg" disabled>
        Event Full
      </Button>
    );
  }

  return (
    <>
      <Button
        size="lg"
        className="w-full rounded-xl text-lg"
        disabled={isPending}
        onClick={handleRegisterClick}
      >
        {isPending ? (event.requireApproval ? 'Applying...' : 'Registering...') : buttonLabel}
      </Button>

      {hasQuestions && (
        <RegistrationQuestionnaireModal
          event={event}
          open={modalOpen}
          onOpenChange={setModalOpen}
          onConfirm={(answers) => {
            setModalOpen(false);
            doRegister(answers);
          }}
          isPending={isPending}
          buttonLabel={buttonLabel}
        />
      )}
    </>
  );
}
