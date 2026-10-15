'use client';

import { useState, useTransition } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle, XCircle, Clock, UserCheck, ListChecks, CheckCircle } from 'lucide-react';
import { changeRegistrationStatus } from '@/app/actions/events';
import { statusColors, statusLabels } from '@/lib/types/event';
import { toast } from 'sonner';
import type { EventRegistration } from '@/lib/db/schema';
import type { RegistrationUser } from '@/lib/types/event';

const STATUS_OPTIONS = [
  { value: 'registered', label: 'Going', icon: UserCheck, className: 'text-green-600' },
  { value: 'waitlisted', label: 'Waitlist', icon: ListChecks, className: 'text-amber-500' },
  { value: 'pending_approval', label: 'Pending', icon: Clock, className: 'text-amber-600' },
  { value: 'rejected', label: 'Not Going', icon: XCircle, className: 'text-red-500' },
  { value: 'checked_in', label: 'Checked In', icon: CheckCircle, className: 'text-green-700' },
  { value: 'no_show', label: 'No Show', icon: AlertTriangle, className: 'text-gray-500' },
] as const;

interface StatusChangeDialogProps {
  registration: EventRegistration;
  user: RegistrationUser;
  eventId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StatusChangeDialog({
  registration,
  user,
  eventId,
  open,
  onOpenChange,
}: StatusChangeDialogProps) {
  const [newStatus, setNewStatus] = useState<string>('');
  const [notifyGuest, setNotifyGuest] = useState(true);
  const [message, setMessage] = useState('');
  const [isPending, startTransition] = useTransition();

  const currentLabel = statusLabels[registration.status] || registration.status;
  const availableOptions = STATUS_OPTIONS.filter(opt => opt.value !== registration.status);

  const handleUpdate = () => {
    if (!newStatus) return;
    startTransition(async () => {
      try {
        await changeRegistrationStatus(registration.id, eventId, newStatus);
        toast.success(`Status updated to ${statusLabels[newStatus] || newStatus}`);
        setNewStatus('');
        setMessage('');
        onOpenChange(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to update status');
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="sr-only">Change Registration Status</DialogTitle>
        </DialogHeader>

        {/* User info */}
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={user.image || undefined} />
            <AvatarFallback className="text-sm">
              {user.name?.split(' ').map(n => n[0]).join('') || '?'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">{user.name || 'Unknown'}</p>
            <p className="text-sm text-muted-foreground truncate">{user.email}</p>
          </div>
          <Badge
            variant="outline"
            className={`text-xs shrink-0 ${statusColors[registration.status] || ''}`}
          >
            {currentLabel}
          </Badge>
        </div>

        {/* Status select */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Change status to:</label>
          <Select value={newStatus} onValueChange={setNewStatus}>
            <SelectTrigger>
              <SelectValue placeholder="Choose new status" />
            </SelectTrigger>
            <SelectContent>
              {availableOptions.map(opt => {
                const Icon = opt.icon;
                return (
                  <SelectItem key={opt.value} value={opt.value}>
                    <span className="flex items-center gap-2">
                      <Icon className={`h-3.5 w-3.5 ${opt.className}`} />
                      {opt.label}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        {/* Notify Guest — WIP */}
        <div className="space-y-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
          <div className="flex items-center gap-2">
            <Checkbox
              id="notify-guest"
              checked={notifyGuest}
              onCheckedChange={(checked) => setNotifyGuest(checked === true)}
              disabled
            />
            <label htmlFor="notify-guest" className="text-sm font-medium text-muted-foreground">
              Notify Guest
            </label>
            <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-600 ml-auto">
              Coming soon
            </Badge>
          </div>
          <Textarea
            placeholder="Add an optional, custom message..."
            value={message}
            onChange={e => setMessage(e.target.value)}
            className="min-h-[60px] text-sm resize-none"
            disabled
          />
          <p className="text-xs text-muted-foreground">
            Email notifications for status changes are not yet available.
          </p>
        </div>

        <Button
          onClick={handleUpdate}
          disabled={isPending || !newStatus}
          className="w-full"
        >
          {isPending ? 'Updating...' : 'Update Status'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
