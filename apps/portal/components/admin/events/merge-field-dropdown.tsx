'use client';

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Code } from 'lucide-react';
import { useState } from 'react';

interface MergeFieldDropdownProps {
  onInsert: (field: string) => void;
  showEventName?: boolean;
}

const MERGE_FIELDS = [
  { label: 'First Name', value: '{{firstName}}' },
  { label: 'Last Name', value: '{{lastName}}' },
];

const EVENT_FIELD = { label: 'Event Name', value: '{{eventName}}' };

export function MergeFieldDropdown({ onInsert, showEventName }: MergeFieldDropdownProps) {
  const [open, setOpen] = useState(false);
  const fields = showEventName ? [...MERGE_FIELDS, EVENT_FIELD] : MERGE_FIELDS;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="h-8 px-2 flex items-center gap-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="Insert merge field"
        >
          <Code className="h-4 w-4" />
          <span className="hidden sm:inline">Merge Field</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-1" align="start">
        {fields.map((field) => (
          <button
            key={field.value}
            type="button"
            className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors"
            onClick={() => {
              onInsert(field.value);
              setOpen(false);
            }}
          >
            {field.label}
            <span className="ml-2 text-xs text-muted-foreground">{field.value}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
