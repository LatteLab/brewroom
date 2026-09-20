// Discriminated union of every transactional template + payload shape.
// Adding a template: add its key + payload type here, then render it from
// lib/emails/transactional-renderer.ts.

export type TransactionalTemplate =
  | 'registration_received'
  | 'waitlist_joined'
  | 'registration_approved'
  | 'registration_rejected'
  | 'lottery_selected'
  | 'lottery_not_selected'
  | 'waitlist_promoted'
  | 'plus_one_invite_received'
  | 'plus_one_accepted'
  | 'plus_one_declined'
  | 'plus_one_cancelled'
  | 'event_changed'
  | 'event_cancelled'
  | 'event_reminder'
  | 'photos_available'
  | 'admin_reply';

export interface EventSummary {
  name: string;
  date: string; // ISO
  endDate?: string | null;
  location?: string | null;
  coverImage?: string | null;
  url: string; // app URL to event detail
}

export interface RegistrationReceivedPayload {
  userName: string | null;
  event: EventSummary;
  requiresApproval: boolean;
}

export interface WaitlistJoinedPayload {
  userName: string | null;
  event: EventSummary;
  position: number | null;
}

export interface RegistrationApprovedPayload {
  userName: string | null;
  event: EventSummary;
}

export interface RegistrationRejectedPayload {
  userName: string | null;
  event: EventSummary;
}

export interface LotterySelectedPayload {
  userName: string | null;
  event: EventSummary;
}

export interface LotteryNotSelectedPayload {
  userName: string | null;
  event: EventSummary;
}

export interface WaitlistPromotedPayload {
  userName: string | null;
  event: EventSummary;
}

export interface PlusOneInviteReceivedPayload {
  inviteeName: string | null;
  inviterName: string | null;
  event: EventSummary;
}

export interface PlusOneAcceptedPayload {
  inviterName: string | null;
  inviteeName: string | null;
  event: EventSummary;
}

export interface PlusOneDeclinedPayload {
  inviterName: string | null;
  inviteeName: string | null;
  event: EventSummary;
}

export interface PlusOneCancelledPayload {
  inviteeName: string | null;
  inviterName: string | null;
  event: EventSummary;
}

export interface EventChangedPayload {
  userName: string | null;
  event: EventSummary;
  changes: { field: string; oldValue: string | null; newValue: string | null }[];
}

export interface EventCancelledPayload {
  userName: string | null;
  event: EventSummary;
  reason?: string | null;
}

export interface EventReminderPayload {
  userName: string | null;
  event: EventSummary;
  humanOffsetLabel: string; // e.g. "tomorrow", "in 1 hour"
}

export interface PhotosAvailablePayload {
  userName: string | null;
  event: EventSummary;
  photoCount: number;
}

export interface AdminReplyPayload {
  /** Subject is supplied by the action via subjectOverride; payload only carries body. */
  bodyHtml: string;
  /** Optional sender display name (e.g. the admin's name) - appears as a small footer line. */
  senderName: string | null;
}

export interface PayloadByTemplate {
  registration_received: RegistrationReceivedPayload;
  waitlist_joined: WaitlistJoinedPayload;
  registration_approved: RegistrationApprovedPayload;
  registration_rejected: RegistrationRejectedPayload;
  lottery_selected: LotterySelectedPayload;
  lottery_not_selected: LotteryNotSelectedPayload;
  waitlist_promoted: WaitlistPromotedPayload;
  plus_one_invite_received: PlusOneInviteReceivedPayload;
  plus_one_accepted: PlusOneAcceptedPayload;
  plus_one_declined: PlusOneDeclinedPayload;
  plus_one_cancelled: PlusOneCancelledPayload;
  event_changed: EventChangedPayload;
  event_cancelled: EventCancelledPayload;
  event_reminder: EventReminderPayload;
  photos_available: PhotosAvailablePayload;
  admin_reply: AdminReplyPayload;
}

export type PayloadFor<T extends TransactionalTemplate> = PayloadByTemplate[T];

/** Build an EventSummary from an Event row. */
export function buildEventSummary(
  event: { id: string; name: string; date: Date; endDate: Date | null; location: string | null; coverImage: string | null },
  appUrl: string = getAppUrl(),
): EventSummary {
  return {
    name: event.name,
    date: event.date.toISOString(),
    endDate: event.endDate ? event.endDate.toISOString() : null,
    location: event.location,
    coverImage: event.coverImage,
    url: `${appUrl}/user/events/${event.id}`,
  };
}

export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.lattelab.org';
}
