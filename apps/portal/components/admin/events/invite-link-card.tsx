'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Copy, RefreshCw, Check, Link } from 'lucide-react';
import { regenerateInviteCode } from '@/app/actions/events';
import { toast } from 'sonner';

export function InviteLinkCard({ eventId, inviteCode }: { eventId: string; inviteCode: string }) {
  const [code, setCode] = useState(inviteCode);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  const inviteUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/invite/${code}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    toast.success('Invite link copied');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRegenerate = () => {
    startTransition(async () => {
      try {
        const newCode = await regenerateInviteCode(eventId);
        setCode(newCode);
        toast.success('Invite link regenerated');
      } catch {
        toast.error('Failed to regenerate invite link');
      }
    });
  };

  return (
    <Card className="mb-6">
      <CardContent className="flex items-center gap-3 py-3">
        <Link className="h-4 w-4 text-muted-foreground shrink-0" />
        <code className="flex-1 text-sm truncate text-muted-foreground">{inviteUrl}</code>
        <Button variant="outline" size="sm" onClick={handleCopy}>
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
        <Button variant="outline" size="sm" onClick={handleRegenerate} disabled={isPending}>
          <RefreshCw className={`h-3.5 w-3.5 ${isPending ? 'animate-spin' : ''}`} />
        </Button>
      </CardContent>
    </Card>
  );
}
