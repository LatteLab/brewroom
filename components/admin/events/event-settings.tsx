"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CloseRegistrationButton } from "@/components/admin/events/close-registration-button";
import { InviteLinkCard } from "@/components/admin/events/invite-link-card";
import { EventHistory } from "@/components/admin/events/event-history";
import { deleteEventAction, cancelEventAction } from "@/app/actions/events";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Trash2, Ban } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import type { Event } from "@/lib/db/schema";

export function EventSettings({ event }: { event: Event }) {
  const [showDelete, setShowDelete] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleDelete = () => {
    startTransition(async () => {
      try {
        await deleteEventAction(event.id);
        toast.success("Event deleted");
        router.push("/admin/events");
      } catch {
        toast.error("Failed to delete event");
      }
    });
  };

  const handleCancel = () => {
    startTransition(async () => {
      try {
        await cancelEventAction(event.id, cancelReason.trim() || null);
        toast.success("Event cancelled - registrants notified");
        setShowCancel(false);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to cancel event");
      }
    });
  };

  return (
    <div className="space-y-8">
      {/* Registration */}
      {event.status === "open" && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Registration</h3>
          <div className="rounded-xl border p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Close Registration</p>
                <p className="text-xs text-muted-foreground">
                  Prevent new registrations for this event.
                </p>
              </div>
              <CloseRegistrationButton eventId={event.id} />
            </div>
          </div>
        </div>
      )}

      {/* Private Event - Invite Code */}
      {event.visibility === "private" && event.inviteCode && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Private Event</h3>
          <InviteLinkCard eventId={event.id} inviteCode={event.inviteCode} />
        </div>
      )}

      {/* Change History */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Change History</h3>
        <EventHistory eventId={event.id} />
      </div>

      {/* Danger Zone */}
      <div>
        <h3 className="text-sm font-semibold text-red-600 mb-3">Danger Zone</h3>
        <div className="rounded-xl border border-red-200 divide-y">
          {event.status !== "cancelled" && event.status !== "completed" && (
            <div className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-medium">Cancel Event</p>
                <p className="text-xs text-muted-foreground">
                  Mark the event as cancelled and email every registrant.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCancel(true)}
              >
                <Ban className="h-3.5 w-3.5 mr-1.5" />
                Cancel Event
              </Button>
            </div>
          )}
          <div className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm font-medium">Delete Event</p>
              <p className="text-xs text-muted-foreground">
                Permanently delete this event and all registrations. This cannot
                be undone.
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowDelete(true)}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Delete
            </Button>
          </div>
        </div>

        <Dialog open={showCancel} onOpenChange={setShowCancel}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cancel &quot;{event.name}&quot;?</DialogTitle>
              <DialogDescription>
                Every registrant (except already-rejected applicants) will receive
                an email letting them know the event is cancelled. The event will
                stay on record but will be visibly marked Cancelled across the app.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                Reason (optional, included in the email)
              </label>
              <Textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g. Venue became unavailable"
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCancel(false)}>
                Keep event
              </Button>
              <Button variant="destructive" onClick={handleCancel} disabled={isPending}>
                {isPending ? "Cancelling..." : "Cancel event & notify"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showDelete} onOpenChange={setShowDelete}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Event</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete &quot;{event.name}&quot;? This
                will permanently remove the event and all associated
                registrations, access records, and lottery history. This action
                cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDelete(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={isPending}
              >
                {isPending ? "Deleting..." : "Delete Event"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
