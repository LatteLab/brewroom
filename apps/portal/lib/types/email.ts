import type { EmailBlast, EmailRecipient } from '@/lib/db/schema';

/** Audience filter discriminated union — stored as JSON in emailBlasts.audienceFilters */
export type AudienceFilter =
  | { type: 'all' }
  | { type: 'event'; eventId: string; registrationStatus?: string | null }
  | { type: 'semester_status'; semesterStatus: string }
  | { type: 'manual'; userIds: string[] };

/** Resolved recipient for audience preview and sending */
export interface ResolvedRecipient {
  userId: string;
  email: string | null;
  name: string | null;
}

/** Blast with aggregated delivery stats for the hub list */
export interface BlastWithStats extends EmailBlast {
  stats: {
    queued: number;
    sent: number;
    delivered: number;
    bounced: number;
    failed: number;
  };
}

/** Recipient row joined with user info for blast detail page */
export interface RecipientWithUser extends EmailRecipient {
  userName: string | null;
}

export const blastStatusColors: Record<string, string> = {
  draft: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
  sending: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  sent: 'bg-green-500/10 text-green-500 border-green-500/20',
  failed: 'bg-red-500/10 text-red-500 border-red-500/20',
};

export const recipientStatusColors: Record<string, string> = {
  queued: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
  sent: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  delivered: 'bg-green-500/10 text-green-500 border-green-500/20',
  bounced: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  failed: 'bg-red-500/10 text-red-500 border-red-500/20',
};
