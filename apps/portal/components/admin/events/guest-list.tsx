"use client";

import { useState, useMemo, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LotteryDraw } from "@/components/admin/events/lottery-draw";
import { LotteryReview } from "@/components/admin/events/lottery-review";
import { GuestDetailSheet } from "@/components/admin/events/guest-detail-sheet";
import { StatusChangeDialog } from "@/components/admin/events/status-change-dialog";
import {
  approveRegistration,
  denyRegistration,
  removeRegistration,
} from "@/app/actions/events";
import { toast } from "sonner";
import { Search, ClipboardCheck, Trash2, Check, X, Mail } from "lucide-react";
import Link from "next/link";
import type { Event, EventPlusOneInvite } from "@/lib/db/schema";
import type { Registration } from "@/lib/types/event";
import { statusColors, statusLabels } from "@/lib/types/event";

type StatusFilter =
  | "all"
  | "going"
  | "pending_approval"
  | "waitlisted"
  | "rejected"
  | "not_going"
  | "checked_in";
type SortBy = "register_time" | "name" | "email" | "status";

const STATUS_FILTER_MAP: Record<StatusFilter, string[]> = {
  all: [],
  going: ["registered", "selected", "checked_in", "draft_selected"],
  pending_approval: ["pending_approval"],
  waitlisted: ["waitlisted"],
  rejected: ["rejected", "draft_rejected"],
  not_going: ["no_show"],
  checked_in: ["checked_in"],
};

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function GuestList({
  event,
  registrations,
  pairings = [],
}: {
  event: Event;
  registrations: Registration[];
  pairings?: EventPlusOneInvite[];
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("register_time");
  const [isPending, startTransition] = useTransition();
  const [selectedRegistration, setSelectedRegistration] = useState<Registration | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [statusChangeReg, setStatusChangeReg] = useState<Registration | null>(null);

  const hasDraft = event.lotteryStatus === "draft";

  // Build map: registrationId → partner info for badges + detail sheet
  const pairingBadgeMap = useMemo(() => {
    const map = new Map<string, { partnerName: string | null; partnerImage: string | null; isInviter: boolean }>();
    for (const pairing of pairings) {
      const inviterReg = registrations.find(r => r.registration.id === pairing.inviterRegistrationId);
      const inviteeReg = registrations.find(r => r.registration.id === pairing.inviteeRegistrationId);
      if (inviterReg && inviteeReg) {
        map.set(pairing.inviterRegistrationId, { partnerName: inviteeReg.user.name, partnerImage: inviteeReg.user.image, isInviter: true });
        map.set(pairing.inviteeRegistrationId, { partnerName: inviterReg.user.name, partnerImage: inviterReg.user.image, isInviter: false });
      }
    }
    return map;
  }, [pairings, registrations]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of registrations) {
      c[r.registration.status] = (c[r.registration.status] || 0) + 1;
    }
    return {
      all: registrations.length,
      going:
        (c["registered"] || 0) +
        (c["selected"] || 0) +
        (c["checked_in"] || 0) +
        (c["draft_selected"] || 0),
      pending_approval: c["pending_approval"] || 0,
      waitlisted: c["waitlisted"] || 0,
      rejected: (c["rejected"] || 0) + (c["draft_rejected"] || 0),
      not_going: c["no_show"] || 0,
      checked_in: c["checked_in"] || 0,
    };
  }, [registrations]);

  const goingCount = counts.going;
  const percent =
    event.capacity > 0 ? Math.round((goingCount / event.capacity) * 100) : 0;

  // Filter out draft statuses from regular guest list when draft active
  const nonDraftRegistrations = useMemo(() => {
    if (!hasDraft) return registrations;
    return registrations.filter(
      (r) =>
        r.registration.status !== "draft_selected" &&
        r.registration.status !== "draft_rejected"
    );
  }, [registrations, hasDraft]);

  const displayed = useMemo(() => {
    let list = [...nonDraftRegistrations];

    const allowedStatuses = STATUS_FILTER_MAP[statusFilter];
    if (allowedStatuses.length > 0) {
      list = list.filter((r) =>
        allowedStatuses.includes(r.registration.status)
      );
    }

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (r) =>
          r.user.name?.toLowerCase().includes(q) ||
          r.user.email?.toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      switch (sortBy) {
        case "name":
          return (a.user.name || "").localeCompare(b.user.name || "");
        case "email":
          return (a.user.email || "").localeCompare(b.user.email || "");
        case "status":
          return a.registration.status.localeCompare(b.registration.status);
        case "register_time":
        default:
          return (
            new Date(b.registration.createdAt).getTime() -
            new Date(a.registration.createdAt).getTime()
          );
      }
    });

    return list;
  }, [nonDraftRegistrations, statusFilter, search, sortBy]);

  const handleApprove = (registrationId: string) => {
    startTransition(async () => {
      try {
        await approveRegistration(registrationId, event.id);
        toast.success("Registration approved");
      } catch {
        toast.error("Failed to approve registration");
      }
    });
  };

  const handleDeny = (registrationId: string) => {
    startTransition(async () => {
      try {
        await denyRegistration(registrationId, event.id);
        toast.success("Registration denied");
      } catch {
        toast.error("Failed to deny registration");
      }
    });
  };

  const handleRemove = (registrationId: string) => {
    startTransition(async () => {
      try {
        await removeRegistration(registrationId, event.id);
        toast.success("Registration removed");
      } catch {
        toast.error("Failed to remove registration");
      }
    });
  };

  const handleRowClick = (reg: Registration) => {
    setSelectedRegistration(reg);
    setModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* At a Glance */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">At a Glance</h3>
        <div className="flex items-baseline justify-between">
          <div className="flex items-baseline gap-4">
            <span className="text-sm">
              <span className="text-2xl font-bold">{goingCount}</span>{" "}
              <span className="text-muted-foreground">Going</span>
            </span>
            {counts.pending_approval > 0 && (
              <span className="text-sm">
                <span className="text-lg font-bold text-amber-600">
                  {counts.pending_approval}
                </span>{" "}
                <span className="text-muted-foreground">Pending</span>
              </span>
            )}
          </div>
          <span className="text-sm text-muted-foreground">
            cap {event.capacity}
          </span>
        </div>
        <Progress value={Math.min(percent, 100)} className="h-2" />
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/admin/events/${event.id}/checkin`}>
          <Button variant="outline" size="sm">
            <ClipboardCheck className="h-3.5 w-3.5 mr-1.5" />
            Check In Guests
          </Button>
        </Link>
        <Button variant="outline" size="sm" asChild>
          <Link
            href={`/admin/email/compose?audienceType=event&eventId=${event.id}`}
          >
            <Mail className="h-3.5 w-3.5 mr-1.5" />
            Email Registrants
          </Link>
        </Button>
        {event.requireApproval && event.status === "open" && !hasDraft && (
          <LotteryDraw
            eventId={event.id}
            entrantCount={counts.pending_approval}
          />
        )}
      </div>

      {/* Lottery Review Panel */}
      {hasDraft && (
        <LotteryReview eventId={event.id} capacity={event.capacity} registrations={registrations} />
      )}

      {/* Guest List */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Guest List</h3>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search guests..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as StatusFilter)}
          >
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Guests ({counts.all})</SelectItem>
              <SelectItem value="going">Going ({counts.going})</SelectItem>
              <SelectItem value="pending_approval">
                Pending Approval ({counts.pending_approval})
              </SelectItem>
              <SelectItem value="waitlisted">
                Waitlisted ({counts.waitlisted})
              </SelectItem>
              <SelectItem value="rejected">
                Rejected ({counts.rejected})
              </SelectItem>
              <SelectItem value="not_going">
                Not Going ({counts.not_going})
              </SelectItem>
              <SelectItem value="checked_in">
                Checked In ({counts.checked_in})
              </SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
            <SelectTrigger className="w-[160px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="register_time">Register Time</SelectItem>
              <SelectItem value="name">Name</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="status">Status</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {displayed.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground text-sm">
            No guests found.
          </p>
        ) : (
          <div className="space-y-1">
            {displayed.map(({ registration, user, stats }) => (
              <div
                key={registration.id}
                className="flex items-center justify-between rounded-lg border p-3 cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => handleRowClick({ registration, user, stats })}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user.image || undefined} />
                    <AvatarFallback className="text-xs">
                      {user.name
                        ?.split(" ")
                        .map((n) => n[0])
                        .join("") || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {user.name || "Unknown"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {user.email}
                    </p>
                  </div>
                  {/* Compact stat indicators */}
                  {stats && (
                    <div className="flex items-center gap-2 ml-1">
                      {stats.noShowCount > 0 && (
                        <Badge
                          variant="outline"
                          className="text-xs bg-red-500/10 text-red-500 border-red-500/20"
                        >
                          {stats.noShowCount} NS
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground hidden sm:inline">
                        {stats.eventsAttended} attended
                      </span>
                      {(stats.semesterLotteryWins > 0 ||
                        stats.semesterLotteryLosses > 0) && (
                        <span className="text-xs text-muted-foreground hidden md:inline">
                          {stats.semesterLotteryWins}W /{" "}
                          {stats.semesterLotteryLosses}L
                        </span>
                      )}
                    </div>
                  )}
                  {/* +1 pairing badge */}
                  {pairingBadgeMap.has(registration.id) && (() => {
                    const pairing = pairingBadgeMap.get(registration.id)!;
                    const firstName = pairing.partnerName?.split(' ')[0] || 'Unknown';
                    return (
                      <Badge
                        variant="outline"
                        className="text-xs bg-purple-500/10 text-purple-600 border-purple-500/20 shrink-0"
                      >
                        <span className="sm:hidden">{pairing.isInviter ? '+1' : 'guest'}</span>
                        <span className="hidden sm:inline">{pairing.isInviter ? `+1 with ${firstName}` : `guest of ${firstName}`}</span>
                      </Badge>
                    );
                  })()}
                </div>
                <div
                  className="flex items-center gap-2 ml-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  {event.requireApproval &&
                    registration.lotteryPriorityScore != null && (
                      <span className="text-xs text-muted-foreground">
                        Score: {registration.lotteryPriorityScore.toFixed(1)}
                      </span>
                    )}
                  <span className="text-xs text-muted-foreground hidden sm:inline">
                    {formatRelativeTime(registration.createdAt)}
                  </span>
                  <Badge
                    variant="outline"
                    className={`text-xs cursor-pointer hover:opacity-80 ${
                      statusColors[registration.status] || ""
                    }`}
                    onClick={() => setStatusChangeReg({ registration, user, stats })}
                  >
                    {statusLabels[registration.status] || registration.status.replaceAll("_", " ")}
                  </Badge>
                  {registration.status === "pending_approval" ? (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-500/10"
                        onClick={() => handleApprove(registration.id)}
                        disabled={isPending}
                        title="Approve"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-500/10"
                        onClick={() => handleDeny(registration.id)}
                        disabled={isPending}
                        title="Decline"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleRemove(registration.id)}
                      disabled={isPending}
                      title="Remove"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Guest Detail Sheet */}
      <GuestDetailSheet
        registration={selectedRegistration}
        eventId={event.id}
        questions={event.questions ?? null}
        pairing={selectedRegistration ? pairingBadgeMap.get(selectedRegistration.registration.id) ?? null : null}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />

      {/* Status Change Dialog */}
      {statusChangeReg && (
        <StatusChangeDialog
          registration={statusChangeReg.registration}
          user={statusChangeReg.user}
          eventId={event.id}
          open={!!statusChangeReg}
          onOpenChange={(open) => { if (!open) setStatusChangeReg(null); }}
        />
      )}
    </div>
  );
}
