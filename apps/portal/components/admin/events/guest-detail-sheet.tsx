'use client';

import { useEffect, useState, useTransition, useCallback } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { StatusChangeDialog } from '@/components/admin/events/status-change-dialog';
import {
  Users, XCircle, Trophy, BarChart3, Link2,
  UserPlus, CheckCircle, ClipboardCheck,
  AlertTriangle, ArrowRight, Trash2, Pencil, ExternalLink, Check,
} from 'lucide-react';
import { getRegistrationTimeline, getUserDetailForModal, removeRegistration } from '@/app/actions/events';
import { statusColors, statusLabels } from '@/lib/types/event';
import { toast } from 'sonner';
import Link from 'next/link';
import type { Registration, EventQuestion } from '@/lib/types/event';

// Timeline entry from the audit log query
interface TimelineEntry {
  log: {
    id: string;
    action: string;
    oldStatus: string | null;
    newStatus: string;
    actorType: string;
    createdAt: Date;
  };
  actor: {
    id: string;
    name: string | null;
  } | null;
}

// User detail data from getUserDetailForModal
interface UserDetailData {
  user: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
    major?: string | null;
    classYear?: string | null;
    bio?: string | null;
  };
  stats: {
    noShowCount: number;
    eventsAttended: number;
    semesterLotteryWins: number;
    semesterLotteryLosses: number;
  };
  eventHistory: {
    eventName: string;
    eventDate: Date;
    status: string;
  }[];
}

const TIMELINE_ICONS: Record<string, { icon: typeof UserPlus; color: string }> = {
  registered: { icon: UserPlus, color: 'text-green-500' },
  approved: { icon: CheckCircle, color: 'text-green-500' },
  denied: { icon: XCircle, color: 'text-red-500' },
  lottery_won: { icon: Trophy, color: 'text-green-500' },
  lottery_lost: { icon: Trophy, color: 'text-red-500' },
  checked_in: { icon: ClipboardCheck, color: 'text-green-600' },
  no_show: { icon: AlertTriangle, color: 'text-gray-500' },
  status_changed: { icon: ArrowRight, color: 'text-blue-500' },
  removed: { icon: Trash2, color: 'text-red-500' },
};

function getTimelineLabel(entry: TimelineEntry): { title: string; subtitle: string } {
  const { log, actor } = entry;
  const actorName = actor?.name || 'Unknown';

  switch (log.action) {
    case 'registered': {
      const isPending = log.newStatus === 'pending_approval';
      return {
        title: isPending ? 'Registered (Pending Approval)' : log.newStatus === 'waitlisted' ? 'Registered (Waitlisted)' : 'Registered',
        subtitle: 'Self-registered',
      };
    }
    case 'approved':
      return {
        title: `${statusLabels[log.oldStatus || ''] || log.oldStatus} → ${statusLabels[log.newStatus] || log.newStatus}`,
        subtitle: `Approved by ${actorName}`,
      };
    case 'denied':
      return {
        title: `${statusLabels[log.oldStatus || ''] || log.oldStatus} → ${statusLabels[log.newStatus] || log.newStatus}`,
        subtitle: `Denied by ${actorName}`,
      };
    case 'lottery_won':
      return {
        title: 'Won Lottery',
        subtitle: 'Selected by lottery system',
      };
    case 'lottery_lost':
      return {
        title: 'Lost Lottery',
        subtitle: 'Not selected by lottery system',
      };
    case 'checked_in':
      return {
        title: 'Checked In',
        subtitle: `Checked in by ${actorName}`,
      };
    case 'no_show':
      return {
        title: 'Marked No-Show',
        subtitle: log.actorType === 'system' ? 'Marked by system' : `Marked by ${actorName}`,
      };
    case 'status_changed':
      return {
        title: `${statusLabels[log.oldStatus || ''] || log.oldStatus} → ${statusLabels[log.newStatus] || log.newStatus}`,
        subtitle: `Changed by ${actorName}`,
      };
    case 'removed':
      return {
        title: 'Removed',
        subtitle: `Removed by ${actorName}`,
      };
    default:
      return { title: log.action, subtitle: '' };
  }
}

function formatDateTime(date: Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export interface PairingInfo {
  partnerName: string | null;
  partnerImage: string | null;
  isInviter: boolean;
}

interface GuestDetailSheetProps {
  registration: Registration | null;
  eventId: string;
  questions: EventQuestion[] | null;
  pairing: PairingInfo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GuestDetailSheet({
  registration,
  eventId,
  questions,
  pairing,
  open,
  onOpenChange,
}: GuestDetailSheetProps) {
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [userDetail, setUserDetail] = useState<UserDetailData | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isRemoving, startRemoveTransition] = useTransition();
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);

  const fetchData = useCallback(() => {
    if (!registration) return;
    startTransition(async () => {
      const [timelineData, detailData] = await Promise.all([
        getRegistrationTimeline(registration.registration.id),
        getUserDetailForModal(registration.user.id),
      ]);
      setTimeline(timelineData);
      setUserDetail(detailData);
    });
  }, [registration]);

  useEffect(() => {
    if (open && registration) {
      fetchData();
    }
  }, [open, registration, fetchData]);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setTimeline([]);
      setUserDetail(null);
    }
    onOpenChange(newOpen);
  };

  const handleRemove = () => {
    if (!registration) return;
    startRemoveTransition(async () => {
      try {
        await removeRegistration(registration.registration.id, eventId);
        toast.success('Guest removed');
        onOpenChange(false);
      } catch {
        toast.error('Failed to remove guest');
      }
    });
  };

  const handleStatusChanged = () => {
    // Refetch timeline after status change
    fetchData();
  };

  const reg = registration;
  const user = reg?.user;
  const detail = userDetail;

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="px-6 pt-6">
            <SheetTitle>Guest Details</SheetTitle>
          </SheetHeader>

          {reg && user && (
            <div className="mt-4 px-6 pb-8">
              {/* Header: Avatar + Name + Status Badge */}
              <div className="flex items-start gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={user.image || undefined} />
                  <AvatarFallback className="text-lg">
                    {user.name?.split(' ').map(n => n[0]).join('') || '?'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0 pt-0.5">
                  <h3 className="text-lg font-semibold leading-tight">{user.name || 'Unknown'}</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">{user.email}</p>
                  {detail && (detail.user.classYear || detail.user.major) && (
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {[detail.user.classYear && `Class of ${detail.user.classYear}`, detail.user.major].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
                <Badge
                  variant="outline"
                  className={`cursor-pointer hover:opacity-80 shrink-0 ${statusColors[reg.registration.status] || ''}`}
                  onClick={() => setStatusDialogOpen(true)}
                >
                  {statusLabels[reg.registration.status] || reg.registration.status}
                  <Pencil className="h-3 w-3 ml-1.5" />
                </Badge>
              </div>

              {/* Bio */}
              {detail?.user.bio && (
                <p className="text-sm text-muted-foreground mt-4 leading-relaxed">{detail.user.bio}</p>
              )}

              {/* Registration Time */}
              <div className="mt-6">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Registration Time</p>
                <p className="text-base font-semibold mt-1">
                  {formatDateTime(reg.registration.createdAt)}
                </p>
              </div>

              {/* Registration Answers */}
              {questions && questions.length > 0 && reg.registration.questionnaireAnswers && (
                <div className="mt-6 border-t pt-6">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3">Registration Answers</p>
                  <div className="space-y-2">
                    {questions.map((q) => {
                      const answer = reg.registration.questionnaireAnswers?.[q.id];
                      if (q.type === 'consent') {
                        const yes = answer === true;
                        return (
                          <div key={q.id} className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground shrink-0 mr-4 max-w-[60%] leading-snug">{q.label}</span>
                            <span className={`flex items-center gap-1 font-medium shrink-0 ${yes ? 'text-green-600' : 'text-muted-foreground'}`}>
                              {yes ? (
                                <><Check className="h-3.5 w-3.5" /> Yes</>
                              ) : (
                                <><XCircle className="h-3.5 w-3.5" /> No</>
                              )}
                            </span>
                          </div>
                        );
                      }
                      return (
                        <div key={q.id} className="flex items-start justify-between text-sm gap-4">
                          <span className="text-muted-foreground shrink-0 max-w-[60%] leading-snug">{q.label}</span>
                          <span className="text-right font-medium break-words min-w-0">{(answer as string) || 'None provided'}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Paired With */}
              {pairing && (
                <div className="mt-6 border-t pt-6">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3">
                    {pairing.isInviter ? 'Paired With (+1)' : 'Guest Of'}
                  </p>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={pairing.partnerImage || undefined} />
                      <AvatarFallback className="text-xs">
                        {pairing.partnerName?.split(' ').map(n => n[0]).join('') || '?'}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium">{pairing.partnerName || 'Unknown'}</span>
                    <Link2 className="h-3.5 w-3.5 text-purple-500 ml-auto" />
                  </div>
                </div>
              )}

              <Separator className="my-8" />

              {/* Timeline */}
              <div>
                <h4 className="text-sm font-semibold mb-4">Timeline</h4>
                {timeline.length > 0 ? (
                  <div className="relative pl-8">
                    {/* Vertical line */}
                    <div className="absolute left-[13px] top-1 bottom-1 w-px bg-border" />

                    <div className="space-y-5">
                      {timeline.map((entry) => {
                        const iconConfig = entry.log.action === 'registered' && entry.log.newStatus === 'pending_approval'
                          ? { icon: UserPlus, color: 'text-amber-500' }
                          : TIMELINE_ICONS[entry.log.action] || TIMELINE_ICONS['status_changed'];
                        const Icon = iconConfig.icon;
                        const { title, subtitle } = getTimelineLabel(entry);

                        return (
                          <div key={entry.log.id} className="relative">
                            {/* Icon dot */}
                            <div className="absolute -left-8 top-0.5 h-[26px] w-[26px] rounded-full bg-background border-2 border-border flex items-center justify-center">
                              <Icon className={`h-3.5 w-3.5 ${iconConfig.color}`} />
                            </div>
                            <div className="pl-1">
                              <p className="text-sm font-medium leading-snug">{title}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
                              <p className="text-xs text-muted-foreground">
                                {formatDateTime(entry.log.createdAt)}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : !isPending ? (
                  <p className="text-sm text-muted-foreground">No timeline data available.</p>
                ) : null}
              </div>

              <Separator className="my-8" />

              {/* Member Stats */}
              {detail && (
                <div>
                  <h4 className="text-sm font-semibold mb-4">Member Stats</h4>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="rounded-lg border px-3 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-1.5 text-muted-foreground mb-0.5">
                        <Users className="h-3.5 w-3.5 text-primary" />
                        <span className="text-xs">Attended</span>
                      </div>
                      <p className="text-lg font-bold">{detail.stats.eventsAttended}</p>
                    </div>
                    <div className="rounded-lg border px-3 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-1.5 text-muted-foreground mb-0.5">
                        <XCircle className="h-3.5 w-3.5 text-destructive" />
                        <span className="text-xs">No-Shows</span>
                      </div>
                      <p className="text-lg font-bold">{detail.stats.noShowCount}</p>
                    </div>
                    <div className="rounded-lg border px-3 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-1.5 text-muted-foreground mb-0.5">
                        <Trophy className="h-3.5 w-3.5 text-amber-500" />
                        <span className="text-xs">Lottery Wins</span>
                      </div>
                      <p className="text-lg font-bold">{detail.stats.semesterLotteryWins}</p>
                    </div>
                    <div className="rounded-lg border px-3 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-1.5 text-muted-foreground mb-0.5">
                        <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs">Lottery Losses</span>
                      </div>
                      <p className="text-lg font-bold">{detail.stats.semesterLotteryLosses}</p>
                    </div>
                  </div>
                </div>
              )}

              <Separator className="my-8" />

              {/* Event History */}
              {detail && (
                <div>
                  <h4 className="text-sm font-semibold mb-4">Event History</h4>
                  {detail.eventHistory.length > 0 ? (
                    <div className="space-y-3">
                      {detail.eventHistory.map((h, i) => (
                        <div key={i} className="flex items-center justify-between py-1">
                          <div>
                            <p className="text-sm font-medium">{h.eventName}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {new Date(h.eventDate).toLocaleDateString('en-US', {
                                month: 'short', day: 'numeric', year: 'numeric',
                              })}
                            </p>
                          </div>
                          <Badge variant="outline" className={`text-xs ${statusColors[h.status] || ''}`}>
                            {statusLabels[h.status] || h.status.replaceAll('_', ' ')}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No event history.</p>
                  )}
                </div>
              )}

              <Separator className="my-8" />

              {/* Footer Actions */}
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/admin/users/${user.id}`}>
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                    View Full Profile
                  </Link>
                </Button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                      Remove Guest
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove guest?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will remove {user.name || 'this guest'} from the event. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleRemove}
                        disabled={isRemoving}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {isRemoving ? 'Removing...' : 'Remove'}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Status Change Dialog */}
      {reg && (
        <StatusChangeDialog
          registration={reg.registration}
          user={reg.user}
          eventId={eventId}
          open={statusDialogOpen}
          onOpenChange={(open) => {
            setStatusDialogOpen(open);
            if (!open) handleStatusChanged();
          }}
        />
      )}
    </>
  );
}
