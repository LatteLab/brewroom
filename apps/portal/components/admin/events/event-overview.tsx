"use client";

import { useState, useTransition } from "react";
import { sanitize } from "@/lib/sanitize";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { EventForm } from "@/components/admin/events/event-form";
import { approveRegistration, denyRegistration, duplicateEventAction } from "@/app/actions/events";
import { useRouter } from "next/navigation";
import { parseGradient, gradientConfigToCSS } from "@/lib/gradients";
import { toast } from "sonner";
import {
  ExternalLink,
  Pencil,
  Copy,
  Check,
  MapPin,
  Calendar,
  Clock,
  CopyPlus,
} from "lucide-react";
import Link from "next/link";
import type { Event } from "@/lib/db/schema";
import type { Registration } from "@/lib/types/event";
import { statusColors } from "@/lib/types/event";
import { SendInviteButton } from "@/components/admin/events/send-invite-button";

export function EventOverview({
  event,
  registrations,
  onSwitchToGuests,
}: {
  event: Event;
  registrations: Registration[];
  onSwitchToGuests: () => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const goingStatuses = ["registered", "selected", "checked_in"];
  const goingCount = registrations.filter((r) =>
    goingStatuses.includes(r.registration.status)
  ).length;

  const inviteEmails = registrations
    .filter((r) => ['registered', 'selected'].includes(r.registration.status) && r.user.email)
    .map((r) => r.user.email as string);
  const pendingCount = registrations.filter(
    (r) => r.registration.status === "pending_approval"
  ).length;
  const percent =
    event.capacity > 0 ? Math.round((goingCount / event.capacity) * 100) : 0;

  const recentRegistrations = [...registrations]
    .sort(
      (a, b) =>
        new Date(b.registration.createdAt).getTime() -
        new Date(a.registration.createdAt).getTime()
    )
    .slice(0, 5);

  const handleCopyLink = async () => {
    try {
      const baseUrl = window.location.origin;
      const url =
        event.visibility === "private" && event.inviteCode
          ? `${baseUrl}/invite/${event.inviteCode}`
          : `${baseUrl}/user/events/${event.id}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy link");
    }
  };

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

  const handleDuplicate = () => {
    startTransition(async () => {
      try {
        const copy = await duplicateEventAction(event.id);
        toast.success('Event duplicated');
        router.push(`/admin/events/${copy.id}`);
      } catch {
        toast.error('Failed to duplicate event');
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

  const gradient = event.coverImage ? parseGradient(event.coverImage) : null;
  const coverStyle = gradient
    ? { background: gradientConfigToCSS(gradient) }
    : event.coverImage
    ? {
        backgroundImage: `url(${event.coverImage})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : { background: "#e5e7eb" };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-6">
      {/* Quick Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
          <Pencil className="h-3.5 w-3.5 mr-1.5" />
          Edit Event
        </Button>
        <Button variant="outline" size="sm" onClick={handleCopyLink}>
          {copied ? (
            <Check className="h-3.5 w-3.5 mr-1.5" />
          ) : (
            <Copy className="h-3.5 w-3.5 mr-1.5" />
          )}
          {copied ? "Copied" : "Copy Link"}
        </Button>
        <Link href={`/user/events/${event.id}`} target="_blank">
          <Button variant="outline" size="sm">
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
            Event Page
          </Button>
        </Link>
        <SendInviteButton event={event} emails={inviteEmails} />
        <Button variant="outline" size="sm" onClick={handleDuplicate} disabled={isPending}>
          <CopyPlus className="h-3.5 w-3.5 mr-1.5" />
          Duplicate
        </Button>
      </div>

      {/* Event Preview */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div
          className="w-full sm:w-48 h-32 sm:h-auto sm:min-h-[160px] rounded-xl shrink-0"
          style={coverStyle}
        />
        <div className="space-y-3 flex-1">
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-1.5">
              When &amp; Where
            </h3>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{formatDate(event.date)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <span>
                  {formatTime(event.date)}
                  {event.endDate && ` - ${formatTime(event.endDate)}`}
                </span>
              </div>
              {event.location && (
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{event.location}</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={
                event.status === "open"
                  ? "border-green-500/20 text-green-600"
                  : ""
              }
            >
              {event.status}
            </Badge>
            <Badge variant="outline">{event.visibility}</Badge>
            {event.requireApproval && (
              <Badge
                variant="outline"
                className="border-amber-500/20 text-amber-600"
              >
                approval required
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Description */}
      {event.description && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-1.5">
            Description
          </h3>
          <div
            className="prose prose-sm dark:prose-invert max-w-none text-sm text-muted-foreground"
            dangerouslySetInnerHTML={{ __html: sanitize(event.description) }}
          />
        </div>
      )}

      {/* Guests Section */}
      <div className="border-t pt-6">
        <h3 className="text-sm font-semibold mb-3">Guests</h3>
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-sm">
              <span className="text-2xl font-bold">{goingCount}</span>{" "}
              <span className="text-muted-foreground">Going</span>
            </span>
            <span className="text-sm text-muted-foreground">
              cap {event.capacity}
            </span>
          </div>
          <Progress value={Math.min(percent, 100)} className="h-2" />
          {pendingCount > 0 && (
            <p className="text-sm text-amber-600">
              {pendingCount} Pending Approval
            </p>
          )}
        </div>

        {/* Recent Registrations */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium">Recent Registrations</h4>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={onSwitchToGuests}
            >
              All Guests →
            </Button>
          </div>
          {recentRegistrations.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No registrations yet.
            </p>
          ) : (
            <div className="space-y-1">
              {recentRegistrations.map(({ registration, user }) => (
                <div
                  key={registration.id}
                  className="flex items-center justify-between rounded-lg border p-2.5"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar className="h-7 w-7">
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
                  </div>
                  <div className="flex items-center gap-1.5 ml-2">
                    {registration.status === "pending_approval" ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs text-green-600 hover:text-green-700 hover:bg-green-500/10"
                          onClick={() => handleApprove(registration.id)}
                          disabled={isPending}
                        >
                          Approve
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-500/10"
                          onClick={() => handleDeny(registration.id)}
                          disabled={isPending}
                        >
                          Decline
                        </Button>
                      </>
                    ) : (
                      <Badge
                        variant="outline"
                        className={`text-xs ${
                          statusColors[registration.status] || ""
                        }`}
                      >
                        {registration.status.replaceAll("_", " ")}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Edit Event Sheet */}
      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Edit Event</SheetTitle>
          </SheetHeader>
          <div className="mt-6 px-4 pb-4">
            <EventForm event={event} compact />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
