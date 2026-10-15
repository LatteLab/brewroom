'use client';

import { useEffect, useState } from 'react';
import { getEventEditLogAction } from '@/app/actions/events';
import { Loader2 } from 'lucide-react';

type LogEntry = Awaited<ReturnType<typeof getEventEditLogAction>>[number];

const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  description: 'Description',
  date: 'Date',
  endDate: 'End date',
  location: 'Location',
  capacity: 'Capacity',
  visibility: 'Visibility',
  status: 'Status',
  requireApproval: 'Approval required',
  waitlistEnabled: 'Waitlist',
  plusOneEnabled: '+1 pairing',
};

function formatValue(field: string, value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (field === 'date' || field === 'endDate') {
    return new Date(value as string).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string' && value.length > 60) return value.slice(0, 60) + '…';
  return String(value);
}

export function EventHistory({ eventId }: { eventId: string }) {
  const [entries, setEntries] = useState<LogEntry[] | null>(null);

  useEffect(() => {
    getEventEditLogAction(eventId).then(setEntries).catch(() => setEntries([]));
  }, [eventId]);

  if (entries === null) {
    return <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>;
  }

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">No edits recorded yet.</p>;
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <div key={entry.id} className="rounded-lg border p-3 space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{entry.changedBy.name ?? 'Unknown'}</span>
            <span>{new Date(entry.changedAt).toLocaleDateString('en-US', {
              month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
            })}</span>
          </div>
          <div className="space-y-1">
            {Object.entries(entry.changes).map(([field, { old: oldVal, new: newVal }]) => (
              <div key={field} className="text-xs">
                <span className="font-medium">{FIELD_LABELS[field] ?? field}:</span>{' '}
                <span className="line-through text-muted-foreground">{formatValue(field, oldVal)}</span>
                {' → '}
                <span>{formatValue(field, newVal)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
