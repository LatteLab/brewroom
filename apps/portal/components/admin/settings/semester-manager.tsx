'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { setSemesterAction, clearSemesterAction } from '@/app/actions/admin';
import { toast } from 'sonner';

interface SemesterData {
  currentLabel: string;
  autoLabel: string;
  hasOverride: boolean;
  semesters: { id: string; label: string; isCurrent: boolean; createdAt: Date }[];
}

export function SemesterManager({ data }: { data: SemesterData }) {
  const [label, setLabel] = useState(data.hasOverride ? data.currentLabel : '');
  const [isPending, startTransition] = useTransition();

  const handleOverride = () => {
    if (!label.trim()) return;
    startTransition(async () => {
      try {
        await setSemesterAction(label.trim());
        toast.success(`Semester set to "${label.trim()}"`);
      } catch {
        toast.error('Failed to set semester');
      }
    });
  };

  const handleReset = () => {
    startTransition(async () => {
      try {
        await clearSemesterAction();
        setLabel('');
        toast.success('Semester reset to auto-detection');
      } catch {
        toast.error('Failed to reset semester');
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <p className="text-sm">
          Current semester:{' '}
          <span className="font-semibold">{data.currentLabel}</span>
        </p>
        <Badge variant="outline" className="text-xs">
          {data.hasOverride ? 'manual override' : 'auto-detected'}
        </Badge>
      </div>

      {!data.hasOverride && (
        <p className="text-xs text-muted-foreground">
          Auto-detected from MIT academic calendar (IAP: Jan, Spring: Feb–May, Summer: Jun–Aug, Fall: Sep–Dec)
        </p>
      )}

      <div className="flex items-center gap-2">
        <Input
          placeholder={data.autoLabel}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="max-w-xs"
          disabled={isPending}
        />
        <Button size="sm" onClick={handleOverride} disabled={isPending || !label.trim()}>
          Override
        </Button>
        {data.hasOverride && (
          <Button size="sm" variant="outline" onClick={handleReset} disabled={isPending}>
            Reset to Auto
          </Button>
        )}
      </div>

      {data.semesters.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-1">Past semesters:</p>
          <div className="flex flex-wrap gap-1">
            {data.semesters.map((s) => (
              <Badge key={s.id} variant="outline" className="text-xs">
                {s.label}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
