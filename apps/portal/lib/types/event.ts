import type { EventRegistration, EventPlusOneInvite } from '@/lib/db/schema';

export interface EventQuestion {
  id: string;
  type: 'text' | 'consent';
  label: string;
  required: boolean;
}

export type QuestionnaireAnswers = Record<string, string | boolean>;

export interface RegistrationUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

export interface RegistrationStats {
  noShowCount: number;
  eventsAttended: number;
  lastEventName: string | null;
  lastEventDate: Date | null;
  semesterLotteryWins: number;
  semesterLotteryLosses: number;
}

/** Base registration row returned by getEventRegistrations() */
export interface RegistrationRow {
  registration: EventRegistration;
  user: RegistrationUser;
}

/** Registration row enriched with stats via getEventRegistrations(id, { withStats: true }) */
export interface RegistrationWithStats extends RegistrationRow {
  stats: RegistrationStats;
}

/** Component-friendly type — stats may or may not be present */
export type Registration = RegistrationRow & { stats?: RegistrationStats };

export interface PlusOneInviteWithUsers extends EventPlusOneInvite {
  inviterUser: RegistrationUser;
  inviteeUser: RegistrationUser;
}

export const statusLabels: Record<string, string> = {
  registered: 'Going',
  waitlisted: 'Waitlist',
  pending_approval: 'Pending',
  selected: 'Selected',
  rejected: 'Not Going',
  checked_in: 'Checked In',
  no_show: 'No Show',
  draft_selected: 'Draft Selected',
  draft_rejected: 'Draft Rejected',
};

export const statusColors: Record<string, string> = {
  registered: 'bg-green-500/10 text-green-500 border-green-500/20',
  waitlisted: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  selected: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  rejected: 'bg-red-500/10 text-red-500 border-red-500/20',
  checked_in: 'bg-green-500/10 text-green-700 border-green-500/20',
  no_show: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
  pending_approval: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  draft_selected: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  draft_rejected: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
};
