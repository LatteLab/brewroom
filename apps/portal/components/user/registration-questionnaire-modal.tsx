'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { Event } from '@/lib/db/schema';
import type { EventQuestion, QuestionnaireAnswers } from '@/lib/types/event';

interface Props {
  event: Event;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (answers: QuestionnaireAnswers) => void;
  isPending: boolean;
  buttonLabel: string;
}

export function RegistrationQuestionnaireModal({
  event,
  open,
  onOpenChange,
  onConfirm,
  isPending,
  buttonLabel,
}: Props) {
  const questions = (event.questions as EventQuestion[] | null) ?? [];

  const [answers, setAnswers] = useState<QuestionnaireAnswers>(() =>
    Object.fromEntries(
      questions.map((q) => [q.id, q.type === 'consent' ? false : ''])
    )
  );
  // Track which required consent questions the user has explicitly interacted with
  const [consentInteracted, setConsentInteracted] = useState<Set<string>>(new Set());

  const canSubmit = questions.every((q) => {
    if (!q.required) return true;
    if (q.type === 'text') return (answers[q.id] as string).trim().length > 0;
    if (q.type === 'consent') return consentInteracted.has(q.id);
    return true;
  });

  function handleConfirm() {
    onConfirm(answers);
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      // Reset on close
      setAnswers(
        Object.fromEntries(
          questions.map((q) => [q.id, q.type === 'consent' ? false : ''])
        )
      );
      setConsentInteracted(new Set());
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Before you register</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {questions.map((q) => {
            if (q.type === 'consent') {
              const checked = answers[q.id] as boolean;
              const interacted = consentInteracted.has(q.id);
              return (
                <div key={q.id} className="space-y-2">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id={`q-${q.id}`}
                      checked={checked}
                      onCheckedChange={(value) => {
                        setAnswers((prev) => ({ ...prev, [q.id]: value === true }));
                        setConsentInteracted((prev) => new Set(prev).add(q.id));
                      }}
                      className="mt-0.5"
                    />
                    <Label htmlFor={`q-${q.id}`} className="text-sm leading-snug cursor-pointer">
                      {q.label}
                      {q.required && <span className="text-destructive ml-1">*</span>}
                    </Label>
                  </div>
                  {q.required && !interacted && (
                    <p className="text-xs text-muted-foreground pl-7">
                      Please check or leave unchecked to indicate your preference.
                    </p>
                  )}
                </div>
              );
            }

            if (q.type === 'text') {
              return (
                <div key={q.id} className="space-y-1.5">
                  <Label htmlFor={`q-${q.id}`} className="text-sm font-medium">
                    {q.label}
                    {q.required ? (
                      <span className="text-destructive ml-1">*</span>
                    ) : (
                      <span className="text-muted-foreground font-normal ml-1">(optional)</span>
                    )}
                  </Label>
                  <Input
                    id={`q-${q.id}`}
                    value={answers[q.id] as string}
                    onChange={(e) =>
                      setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                    }
                    className="text-sm"
                  />
                </div>
              );
            }

            return null;
          })}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!canSubmit || isPending}>
            {isPending ? 'Submitting...' : buttonLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
