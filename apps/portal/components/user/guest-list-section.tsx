'use client';

import { useState } from 'react';
import { Users, MoreHorizontal } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { RegistrationUser } from '@/lib/types/event';

interface Attendee {
  user: RegistrationUser;
}

interface GuestListSectionProps {
  attendees: Attendee[];
  canViewNames: boolean;
}

function getInitials(name: string | null) {
  return name?.split(' ').map(n => n[0]).join('') || '?';
}

function summaryText(attendees: Attendee[]) {
  const names = attendees.map(a => a.user.name || 'Someone');
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  const remaining = names.length - 2;
  if (remaining === 1) return `${names[0]}, ${names[1]}, and 1 other`;
  return `${names[0]}, ${names[1]}, and ${remaining} others`;
}

export function GuestListSection({ attendees, canViewNames }: GuestListSectionProps) {
  const [open, setOpen] = useState(false);

  if (attendees.length === 0) return null;

  // Not registered — limited view: avatars only, no names, no dialog
  if (!canViewNames) {
    return (
      <div className="pt-4 border-t -mx-2 px-2 py-3">
        <h3 className="text-sm font-medium mb-3">
          {attendees.length} {attendees.length === 1 ? 'person' : 'people'} going
        </h3>
        <div className="flex -space-x-2">
          {attendees.slice(0, 5).map((a) => (
            <Avatar key={a.user.id} className="h-8 w-8 border-2 border-background">
              <AvatarImage src={a.user.image || undefined} />
              <AvatarFallback className="text-xs">
                {getInitials(a.user.name)}
              </AvatarFallback>
            </Avatar>
          ))}
          {attendees.length > 5 && (
            <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-muted">
              <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
        </div>
      </div>
    );
  }

  // Registered — full view: tooltips, names, clickable dialog
  return (
    <>
      <div
        className="pt-4 border-t cursor-pointer rounded-lg transition-colors hover:bg-muted/50 -mx-2 px-2 py-3"
        role="button"
        tabIndex={0}
        aria-label={`View all ${attendees.length} guests`}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true); } }}
      >
        <h3 className="text-sm font-medium mb-3">
          {attendees.length} {attendees.length === 1 ? 'person' : 'people'} going
        </h3>

        <TooltipProvider>
          <div className="flex -space-x-2">
            {attendees.slice(0, 5).map((a) => (
              <Tooltip key={a.user.id}>
                <TooltipTrigger asChild>
                  <div>
                    <Avatar className="h-8 w-8 border-2 border-background">
                      <AvatarImage src={a.user.image || undefined} />
                      <AvatarFallback className="text-xs">
                        {getInitials(a.user.name)}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={4}>
                  {a.user.name || 'Unknown'}
                </TooltipContent>
              </Tooltip>
            ))}
            {attendees.length > 5 && (
              <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-muted text-xs font-medium">
                +{attendees.length - 5}
              </div>
            )}
          </div>
        </TooltipProvider>

        <p className="text-sm text-muted-foreground mt-2">
          {summaryText(attendees)}
        </p>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80vh] flex flex-col gap-0 p-0">
          <DialogHeader className="px-6 pt-6 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <Users className="h-5 w-5 text-muted-foreground" />
              </div>
              <DialogTitle className="text-xl font-bold">
                {attendees.length} {attendees.length === 1 ? 'Guest' : 'Guests'}
              </DialogTitle>
            </div>
          </DialogHeader>

          <div className="overflow-y-auto px-6 pb-6">
            <div className="space-y-1">
              {attendees.map((a) => (
                <div
                  key={a.user.id}
                  className="flex items-center gap-3 rounded-lg px-2 py-2"
                >
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={a.user.image || undefined} />
                    <AvatarFallback className="text-sm">
                      {getInitials(a.user.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium">
                    {a.user.name || 'Unknown'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
