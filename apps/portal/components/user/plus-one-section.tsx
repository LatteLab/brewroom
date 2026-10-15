'use client';

import { useState, useTransition } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { UserPlus, Users, X, Check, Link2Off } from 'lucide-react';
import {
  invitePlusOne,
  acceptPlusOneInvite,
  declinePlusOneInvite,
  cancelPlusOneInvite,
  dissolvePlusOnePairing,
  getInvitableUsers,
} from '@/app/actions/events';
import type { Event, EventRegistration, EventPlusOneInvite } from '@/lib/db/schema';

interface InvitableUser {
  id: string;
  name: string | null;
  image: string | null;
}

interface Props {
  event: Event;
  registration: EventRegistration | null;
  /** Outgoing invite sent by the current user (as inviter). */
  outgoingInvite: EventPlusOneInvite | null;
  /** Incoming invite received by the current user (as invitee). */
  incomingInvite: EventPlusOneInvite | null;
  /** User info for the partner (invitee for outgoing, inviter for incoming). */
  partnerUser: { id: string; name: string | null; image: string | null } | null;
}

function UserAvatar({ name, image }: { name: string | null; image: string | null }) {
  const initials = name?.split(' ').map(n => n[0]).join('').slice(0, 2) || '?';
  return (
    <Avatar className="h-8 w-8 shrink-0">
      <AvatarImage src={image || undefined} />
      <AvatarFallback className="text-xs">{initials}</AvatarFallback>
    </Avatar>
  );
}

export function PlusOneSection({ event, registration, outgoingInvite, incomingInvite, partnerUser }: Props) {
  const [isPending, startTransition] = useTransition();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<InvitableUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Don't render if +1 is disabled or user isn't registered
  if (!event.plusOneEnabled || !registration) return null;
  // Don't render for terminal statuses
  if (['rejected', 'checked_in', 'no_show'].includes(registration.status)) return null;

  const openSearch = async () => {
    setSearchOpen(true);
    setLoadingUsers(true);
    try {
      const result = await getInvitableUsers(event.id);
      setUsers(result);
    } catch {
      toast.error('Failed to load members');
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleInvite = (userId: string) => {
    startTransition(async () => {
      try {
        await invitePlusOne(event.id, userId);
        setSearchOpen(false);
        setSearchQuery('');
        toast.success('Invite sent!');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to send invite');
      }
    });
  };

  const handleAccept = () => {
    if (!incomingInvite) return;
    startTransition(async () => {
      try {
        await acceptPlusOneInvite(incomingInvite.id);
        toast.success('Invite accepted!');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to accept invite');
      }
    });
  };

  const handleDecline = () => {
    if (!incomingInvite) return;
    startTransition(async () => {
      try {
        await declinePlusOneInvite(incomingInvite.id);
        toast.success('Invite declined');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to decline invite');
      }
    });
  };

  const handleCancelInvite = () => {
    if (!outgoingInvite) return;
    startTransition(async () => {
      try {
        await cancelPlusOneInvite(outgoingInvite.id);
        toast.success('Invite cancelled');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to cancel invite');
      }
    });
  };

  const handleDissolve = () => {
    const invite = outgoingInvite || incomingInvite;
    if (!invite) return;
    startTransition(async () => {
      try {
        await dissolvePlusOnePairing(invite.id);
        toast.success('Pairing dissolved');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to dissolve pairing');
      }
    });
  };

  const filteredUsers = users.filter(u =>
    !searchQuery || u.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // State: accepted pairing
  const acceptedInvite = outgoingInvite?.status === 'accepted' ? outgoingInvite
    : incomingInvite?.status === 'accepted' ? incomingInvite
    : null;

  if (acceptedInvite && partnerUser) {
    return (
      <div className="rounded-xl border p-3 space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">+1 Guest</p>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <UserAvatar name={partnerUser.name} image={partnerUser.image} />
            <span className="text-sm font-medium">{partnerUser.name || 'Unknown'}</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive h-7 gap-1.5"
            onClick={handleDissolve}
            disabled={isPending}
          >
            <Link2Off className="h-3.5 w-3.5" />
            Unlink
          </Button>
        </div>
      </div>
    );
  }

  // State: outgoing pending invite
  if (outgoingInvite?.status === 'pending' && partnerUser) {
    return (
      <div className="rounded-xl border p-3 space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">+1 Guest</p>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <UserAvatar name={partnerUser.name} image={partnerUser.image} />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{partnerUser.name || 'Unknown'}</p>
              <p className="text-xs text-muted-foreground">Invite pending</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive h-7 gap-1.5 shrink-0"
            onClick={handleCancelInvite}
            disabled={isPending}
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  // State: incoming pending invite
  if (incomingInvite?.status === 'pending' && partnerUser) {
    return (
      <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 space-y-2">
        <p className="text-xs font-medium text-blue-600 uppercase tracking-wide">+1 Invite</p>
        <div className="flex items-center gap-2.5">
          <UserAvatar name={partnerUser.name} image={partnerUser.image} />
          <p className="text-sm">
            <span className="font-medium">{partnerUser.name || 'Someone'}</span>
            {' '}wants you as their +1
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            className="flex-1 h-8 gap-1.5"
            onClick={handleAccept}
            disabled={isPending}
          >
            <Check className="h-3.5 w-3.5" />
            Accept
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-8"
            onClick={handleDecline}
            disabled={isPending}
          >
            Decline
          </Button>
        </div>
      </div>
    );
  }

  // State: no invite — show invite button
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="w-full rounded-xl gap-2"
        onClick={openSearch}
        disabled={isPending}
      >
        <UserPlus className="h-4 w-4" />
        Invite a +1
      </Button>

      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite a +1</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Search members..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              autoFocus
            />
            <div className="max-h-64 overflow-y-auto space-y-1">
              {loadingUsers ? (
                <p className="text-sm text-muted-foreground text-center py-4">Loading...</p>
              ) : filteredUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {searchQuery ? 'No matching members' : 'No members available to invite'}
                </p>
              ) : (
                filteredUsers.map(user => (
                  <button
                    key={user.id}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted text-left transition-colors"
                    onClick={() => handleInvite(user.id)}
                    disabled={isPending}
                  >
                    <UserAvatar name={user.name} image={user.image} />
                    <span className="text-sm font-medium">{user.name || 'Unknown'}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
