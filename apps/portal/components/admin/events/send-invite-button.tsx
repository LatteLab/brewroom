'use client';

import { Button } from '@/components/ui/button';
import { Mail } from 'lucide-react';
import type { Event } from '@/lib/db/schema';
import { stripHtml } from '@/lib/utils';

interface Props {
  event: Event;
  emails: string[];
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function SendInviteButton({ event, emails }: Props) {
  const disabled = emails.length === 0;

  const handleClick = () => {
    const subject = `You're going to ${event.name}!`;

    const lines: string[] = [
      'Hi everyone,',
      '',
      `You've been confirmed for ${event.name}.`,
      '',
      `Date: ${formatDate(event.date)}`,
    ];

    if (event.endDate) {
      lines.push(`End: ${formatDate(event.endDate)}`);
    }
    if (event.location) {
      lines.push(`Location: ${event.location}`);
    }
    if (event.description) {
      const plain = stripHtml(event.description);
      if (plain) {
        lines.push('', plain);
      }
    }

    lines.push('', 'See you there!', 'Latte Lab');

    const body = lines.join('\r\n');
    const cc = emails.join(',');

    const url =
      `mailto:lattelab-exec@mit.edu` +
      `?subject=${encodeURIComponent(subject)}` +
      `&cc=${encodeURIComponent(cc)}` +
      `&body=${encodeURIComponent(body)}`;

    window.location.href = url;
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={disabled}
      title={disabled ? 'No confirmed registrations yet' : undefined}
    >
      <Mail className="h-3.5 w-3.5 mr-1.5" />
      Send Invite Emails{emails.length > 0 ? ` (${emails.length})` : ''}
    </Button>
  );
}
