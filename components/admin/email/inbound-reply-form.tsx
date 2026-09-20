'use client';

import { useState, useTransition } from 'react';
import { Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { replyToInboundEmailAction } from '@/app/actions/inbound-email';

interface Props {
  inboundId: string;
  recipientLabel: string; // shown in the "Replying to ..." header
  defaultSubject: string; // already prefixed with "Re: "
}

/**
 * Compose-and-send box for replying to an inbound email. Plaintext-with-line-breaks input
 * (kept simple intentionally - the existing blast composer covers rich-text needs); the
 * server-side action sanitizes and converts newlines to <br>.
 */
export function InboundReplyForm({ inboundId, recipientLabel, defaultSubject }: Props) {
  const [body, setBody] = useState('');
  const [pending, start] = useTransition();

  const send = () => {
    if (!body.trim()) {
      toast.error('Write something first');
      return;
    }
    // Convert plaintext line breaks to HTML so the email layout preserves spacing.
    const html = body
      .split(/\n{2,}/)
      .map((para) => `<p>${escapeHtml(para).replace(/\n/g, '<br>')}</p>`)
      .join('');

    start(async () => {
      try {
        const r = await replyToInboundEmailAction(inboundId, html);
        if (r.status === 'sent') {
          toast.success('Reply sent');
          setBody('');
        } else if (r.status === 'failed') {
          toast.error('Reply queued but send failed - check email log');
        } else {
          toast.info(`Reply ${r.status}`);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to send');
      }
    });
  };

  return (
    <div className="rounded-md border bg-card p-5">
      <div className="text-xs text-muted-foreground mb-3">
        Replying to <span className="text-foreground font-medium">{recipientLabel}</span>
        <br />
        Subject: <span className="text-foreground font-medium">{defaultSubject}</span>
      </div>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write your reply..."
        rows={8}
        className="mb-3 font-sans"
        disabled={pending}
      />
      <div className="flex justify-end">
        <Button size="sm" onClick={send} disabled={pending}>
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5 mr-1.5" />
          )}
          Send reply
        </Button>
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
