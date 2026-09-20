import { pgTable, pgEnum, text, timestamp, uuid, primaryKey, integer, real, unique, boolean, check, json, index, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { AdapterAccountType } from 'next-auth/adapters';

// ============================================================================
// Enums
// ============================================================================

export const eventVisibilityEnum = pgEnum('event_visibility', ['private', 'public']);
export const eventStatusEnum = pgEnum('event_status', ['open', 'closed', 'completed', 'cancelled']);
export const registrationStatusEnum = pgEnum('registration_status', [
  'registered', 'waitlisted', 'selected', 'rejected', 'checked_in', 'no_show', 'pending_approval', 'draft_selected', 'draft_rejected'
]);
export const lotteryOutcomeEnum = pgEnum('lottery_outcome', ['won', 'lost']);
export const plusOneInviteStatusEnum = pgEnum('plus_one_invite_status', ['pending', 'accepted']);
export const lotteryStatusEnum = pgEnum('lottery_status', ['draft', 'finalized']);
export const emailBlastStatusEnum = pgEnum('email_blast_status', ['draft', 'sending', 'sent', 'failed']);
export const emailAudienceTypeEnum = pgEnum('email_audience_type', ['all', 'event', 'semester_status', 'manual']);
export const emailRecipientStatusEnum = pgEnum('email_recipient_status', ['queued', 'sent', 'delivered', 'bounced', 'failed']);
export const emailOutboxKindEnum = pgEnum('email_outbox_kind', ['transactional', 'blast', 'forwarded_reply']);
export const emailOutboxStatusEnum = pgEnum('email_outbox_status', ['queued', 'sending', 'sent', 'delivered', 'bounced', 'failed']);
export const inboundThreadingSourceEnum = pgEnum('inbound_threading_source', ['reply_address', 'in_reply_to', 'references', 'manual', 'none']);
export const inboundForwardStatusEnum = pgEnum('inbound_forward_status', ['not_attempted', 'sent', 'failed']);

// ============================================================================
// NextAuth Required Tables
// ============================================================================

// Users table - managed by NextAuth
export const users = pgTable('users', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: timestamp('email_verified', { mode: 'date' }),
  image: text('image'),
  major: text('major'),
  classYear: text('class_year'),
  phone: text('phone'),
  interests: text('interests'),
  semesterStatus: text('semester_status'),
  bio: text('bio'),
  location: text('location'),
  isVisibleInDirectory: boolean('is_visible_in_directory').notNull().default(true),
  hidePhone: boolean('hide_phone').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Accounts table - stores OAuth provider accounts linked to users
export const accounts = pgTable('accounts', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').$type<AdapterAccountType>().notNull(),
  provider: text('provider').notNull(),
  providerAccountId: text('provider_account_id').notNull(),
  refresh_token: text('refresh_token'),
  access_token: text('access_token'),
  expires_at: integer('expires_at'),
  token_type: text('token_type'),
  scope: text('scope'),
  id_token: text('id_token'),
  session_state: text('session_state'),
}, (account) => ({
  compoundKey: primaryKey({ columns: [account.provider, account.providerAccountId] }),
}));

// Verification tokens table - for email magic links
export const verificationTokens = pgTable('verification_tokens', {
  identifier: text('identifier').notNull(),
  token: text('token').notNull(),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
}, (vt) => ({
  compositePk: primaryKey({ columns: [vt.identifier, vt.token] }),
}));

// ============================================================================
// Application Tables
// ============================================================================

// Admin whitelist table - stores approved admin emails
export const adminWhitelist = pgTable('admin_whitelist', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Events table
export const events = pgTable('events', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  coverImage: text('cover_image'),
  date: timestamp('date', { mode: 'date' }).notNull(),
  endDate: timestamp('end_date', { mode: 'date' }),
  location: text('location'),
  capacity: integer('capacity').notNull(),
  visibility: eventVisibilityEnum('visibility').notNull().default('private'),
  waitlistEnabled: boolean('waitlist_enabled').notNull().default(false),
  plusOneEnabled: boolean('plus_one_enabled').notNull().default(false),
  requireApproval: boolean('require_approval').notNull().default(false),
  showAttendeesPreRegistration: boolean('show_attendees_pre_registration').notNull().default(true),
  timezone: text('timezone').notNull().default('America/New_York'),
  questions: json('questions').$type<Array<{ id: string; type: 'text' | 'consent'; label: string; required: boolean }>>(),
  status: eventStatusEnum('status').notNull().default('open'),
  lotteryStatus: lotteryStatusEnum('lottery_status'),
  inviteCode: text('invite_code').unique(),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Event access table - tracks which users have access to private events
export const eventAccess = pgTable('event_access', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  userEventUnique: unique().on(table.userId, table.eventId),
}));

// Event registrations table
export const eventRegistrations = pgTable('event_registrations', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  status: registrationStatusEnum('status').notNull(),
  lotteryPriorityScore: real('lottery_priority_score'),
  questionnaireAnswers: json('questionnaire_answers').$type<Record<string, string | boolean>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  userEventUnique: unique().on(table.userId, table.eventId),
}));

// Lottery history table
export const lotteryHistory = pgTable('lottery_history', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  outcome: lotteryOutcomeEnum('outcome').notNull(),
  semester: text('semester'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  userEventUnique: unique().on(table.userId, table.eventId),
}));

// +1 invite table - tracks pairing invites between registered users
export const eventPlusOneInvites = pgTable('event_plus_one_invites', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  inviterRegistrationId: uuid('inviter_registration_id').notNull()
    .references(() => eventRegistrations.id, { onDelete: 'cascade' }),
  inviteeRegistrationId: uuid('invitee_registration_id').notNull()
    .references(() => eventRegistrations.id, { onDelete: 'cascade' }),
  status: plusOneInviteStatusEnum('status').notNull().default('pending'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  uniqueInviter: unique().on(table.inviterRegistrationId),
  uniqueInvitee: unique().on(table.inviteeRegistrationId),
  noSelfInvite: check('no_self_invite', sql`${table.inviterRegistrationId} != ${table.inviteeRegistrationId}`),
}));

// Registration audit log - tracks every status change with actor info
export const registrationAuditLog = pgTable('registration_audit_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  registrationId: uuid('registration_id').references(() => eventRegistrations.id, { onDelete: 'cascade' }),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  oldStatus: text('old_status'),
  newStatus: text('new_status').notNull(),
  action: text('action').notNull(), // 'registered', 'approved', 'denied', 'lottery_won', 'lottery_lost', 'checked_in', 'no_show', 'status_changed', 'removed'
  actorId: text('actor_id').references(() => users.id, { onDelete: 'set null' }),
  actorType: text('actor_type').notNull(), // 'user', 'admin', 'system'
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Semesters table - tracks academic semesters for lottery scoping
export const semesters = pgTable('semesters', {
  id: uuid('id').defaultRandom().primaryKey(),
  label: text('label').notNull().unique(),
  isCurrent: boolean('is_current').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Email blasts table
export const emailBlasts = pgTable('email_blasts', {
  id: uuid('id').defaultRandom().primaryKey(),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  bodyTemplate: text('body_template'),
  audienceType: emailAudienceTypeEnum('audience_type').notNull(),
  audienceFilters: text('audience_filters').notNull(), // JSON stringified
  status: emailBlastStatusEnum('status').notNull().default('draft'),
  // RFC 5322 Message-ID set on send so replies can be threaded back to the blast.
  messageId: text('message_id'),
  sentBy: text('sent_by').notNull().references(() => users.id),
  sentAt: timestamp('sent_at', { mode: 'date' }),
  totalRecipients: integer('total_recipients').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Email recipients table - per-recipient tracking for delivery status
export const emailRecipients = pgTable('email_recipients', {
  id: uuid('id').defaultRandom().primaryKey(),
  blastId: uuid('blast_id').notNull().references(() => emailBlasts.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  resendEmailId: text('resend_email_id'),
  status: emailRecipientStatusEnum('status').notNull().default('queued'),
  statusUpdatedAt: timestamp('status_updated_at', { mode: 'date' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Event photos - admin-curated post-event album
export const eventPhotos = pgTable('event_photos', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  storagePath: text('storage_path').notNull().unique(),
  publicUrl: text('public_url').notNull(),
  caption: text('caption'),
  uploadedBy: text('uploaded_by').notNull().references(() => users.id),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  eventIdIdx: index('event_photos_event_id_idx').on(table.eventId),
  eventOrderIdx: index('event_photos_event_order_idx').on(table.eventId, table.sortOrder, table.createdAt),
}));

// Event edit log - tracks field-level changes on every event update
export const eventEditLog = pgTable('event_edit_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  changedBy: text('changed_by').notNull().references(() => users.id),
  changedAt: timestamp('changed_at').defaultNow().notNull(),
  changes: json('changes').$type<Record<string, { old: unknown; new: unknown }>>().notNull(),
});

// ============================================================================
// Mailing System (transactional outbox + inbound + reminders)
// ============================================================================

// Outbox row per outbound email - transactional, blast (post-migration), or programmatic-forward.
// Acts as both audit log and retry queue: rows are inserted with status='queued' + scheduledFor,
// drained either inline by sendTransactional() or by the cron worker via drainOutbox().
export const emailOutbox = pgTable('email_outbox', {
  id: uuid('id').defaultRandom().primaryKey(),
  kind: emailOutboxKindEnum('kind').notNull(),
  template: text('template'),
  templateVersion: integer('template_version').notNull().default(1),
  // set null on user delete: outbox is an audit log; entries should outlive their referent.
  recipientUserId: text('recipient_user_id').references(() => users.id, { onDelete: 'set null' }),
  recipientEmail: text('recipient_email').notNull(),
  subject: text('subject').notNull(),
  payload: json('payload').$type<Record<string, unknown>>().notNull(),
  replyAddress: text('reply_address'),
  messageId: text('message_id'),
  status: emailOutboxStatusEnum('status').notNull().default('queued'),
  provider: text('provider').notNull().default('resend'),
  providerMessageId: text('provider_message_id'),
  // UNIQUE - enforced via standard PG NULL-distinct semantics: many NULLs allowed, but any
  // non-null key is unique. ON CONFLICT (idempotency_key) DO NOTHING works against this.
  idempotencyKey: text('idempotency_key').unique(),
  // set null on referent delete: outbox is an audit log; entries should outlive deletion of
  // event/registration/blast. Without this, the audit trail and `wasInviteEmailSent()` gate
  // silently break when an admin removes a registration.
  relatedEventId: uuid('related_event_id').references(() => events.id, { onDelete: 'set null' }),
  relatedRegistrationId: uuid('related_registration_id').references(() => eventRegistrations.id, { onDelete: 'set null' }),
  relatedBlastId: uuid('related_blast_id').references(() => emailBlasts.id, { onDelete: 'set null' }),
  // For admin-authored replies to inbound mail. Lets the inbox detail page show "you replied"
  // history alongside the original inbound message.
  replyToInboundId: uuid('reply_to_inbound_id').references((): AnyPgColumn => inboundEmails.id, { onDelete: 'set null' }),
  // Optional raw headers to include on send. Used by replies (In-Reply-To / References) so the
  // recipient's mail client threads the conversation correctly, even on cron retry.
  extraHeaders: json('extra_headers').$type<Record<string, string>>(),
  scheduledFor: timestamp('scheduled_for').notNull().defaultNow(),
  attemptCount: integer('attempt_count').notNull().default(0),
  nextAttemptAt: timestamp('next_attempt_at'),
  lockedAt: timestamp('locked_at'),
  sentAt: timestamp('sent_at'),
  lastError: text('last_error'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  drainIdx: index('email_outbox_drain_idx').on(table.status, table.scheduledFor),
  providerMessageIdIdx: index('email_outbox_provider_message_id_idx').on(table.providerMessageId),
  recipientIdx: index('email_outbox_recipient_idx').on(table.recipientUserId, table.createdAt),
  templateIdx: index('email_outbox_template_idx').on(table.template, table.createdAt),
  relatedEventIdx: index('email_outbox_related_event_idx').on(table.relatedEventId),
}));

// Logs every inbound message (replies + arbitrary mail to lattelab.org). Threaded back to
// originating outbox row via plus-token in To address (primary) or RFC 5322 headers (fallback).
export const inboundEmails = pgTable('inbound_emails', {
  id: uuid('id').defaultRandom().primaryKey(),
  providerEmailId: text('provider_email_id').notNull().unique(),
  fromEmail: text('from_email').notNull(),
  fromName: text('from_name'),
  toEmail: text('to_email').notNull(),
  subject: text('subject'),
  bodyText: text('body_text'),
  bodyHtml: text('body_html'),
  headers: json('headers').$type<Record<string, string | string[]>>(),
  attachmentsMeta: json('attachments_meta').$type<Array<{ filename: string; contentType: string; size: number; providerUrl?: string }>>(),
  messageId: text('message_id'),
  inReplyTo: text('in_reply_to'),
  references: text('references'),
  threadingSource: inboundThreadingSourceEnum('threading_source').notNull().default('none'),
  replyToOutboxId: uuid('reply_to_outbox_id').references(() => emailOutbox.id, { onDelete: 'set null' }),
  replyToBlastId: uuid('reply_to_blast_id').references(() => emailBlasts.id, { onDelete: 'set null' }),
  relatedEventId: uuid('related_event_id').references(() => events.id, { onDelete: 'set null' }),
  relatedUserId: text('related_user_id').references(() => users.id, { onDelete: 'set null' }),
  forwardedTo: text('forwarded_to'),
  forwardStatus: inboundForwardStatusEnum('forward_status').notNull().default('not_attempted'),
  forwardedAt: timestamp('forwarded_at'),
  rawPayload: json('raw_payload').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  outboxRefIdx: index('inbound_emails_outbox_idx').on(table.replyToOutboxId),
  blastRefIdx: index('inbound_emails_blast_idx').on(table.replyToBlastId),
  eventIdx: index('inbound_emails_event_idx').on(table.relatedEventId, table.createdAt),
  fromIdx: index('inbound_emails_from_idx').on(table.fromEmail, table.createdAt),
}));

// Per-event reminder configuration. Default rule (24h before) seeded on event create.
export const eventEmailReminderRules = pgTable('event_email_reminder_rules', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  offsetMinutes: integer('offset_minutes').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  eventOffsetUnique: unique().on(table.eventId, table.offsetMinutes),
}));

// One row per reminder fired. Unique on (registration, offset) prevents double-send for the same rule.
export const eventEmailReminderSends = pgTable('event_email_reminder_sends', {
  id: uuid('id').defaultRandom().primaryKey(),
  registrationId: uuid('registration_id').notNull().references(() => eventRegistrations.id, { onDelete: 'cascade' }),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  offsetMinutes: integer('offset_minutes').notNull(),
  outboxId: uuid('outbox_id').references(() => emailOutbox.id, { onDelete: 'set null' }),
  sentAt: timestamp('sent_at').defaultNow().notNull(),
}, (table) => ({
  registrationOffsetUnique: unique().on(table.registrationId, table.offsetMinutes),
}));

// ============================================================================
// Type Exports
// ============================================================================

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type VerificationToken = typeof verificationTokens.$inferSelect;
export type AdminWhitelist = typeof adminWhitelist.$inferSelect;
export type NewAdminWhitelist = typeof adminWhitelist.$inferInsert;
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type EventRegistration = typeof eventRegistrations.$inferSelect;
export type NewEventRegistration = typeof eventRegistrations.$inferInsert;
export type EventAccess = typeof eventAccess.$inferSelect;
export type NewEventAccess = typeof eventAccess.$inferInsert;
export type LotteryHistory = typeof lotteryHistory.$inferSelect;
export type Semester = typeof semesters.$inferSelect;
export type NewSemester = typeof semesters.$inferInsert;
export type EmailBlast = typeof emailBlasts.$inferSelect;
export type NewEmailBlast = typeof emailBlasts.$inferInsert;
export type EmailRecipient = typeof emailRecipients.$inferSelect;
export type NewEmailRecipient = typeof emailRecipients.$inferInsert;
export type RegistrationAuditLog = typeof registrationAuditLog.$inferSelect;
export type NewRegistrationAuditLog = typeof registrationAuditLog.$inferInsert;
export type EventPlusOneInvite = typeof eventPlusOneInvites.$inferSelect;
export type NewEventPlusOneInvite = typeof eventPlusOneInvites.$inferInsert;
export type EventPhoto = typeof eventPhotos.$inferSelect;
export type NewEventPhoto = typeof eventPhotos.$inferInsert;
export type EmailOutbox = typeof emailOutbox.$inferSelect;
export type NewEmailOutbox = typeof emailOutbox.$inferInsert;
export type InboundEmail = typeof inboundEmails.$inferSelect;
export type NewInboundEmail = typeof inboundEmails.$inferInsert;
export type EventEmailReminderRule = typeof eventEmailReminderRules.$inferSelect;
export type NewEventEmailReminderRule = typeof eventEmailReminderRules.$inferInsert;
export type EventEmailReminderSend = typeof eventEmailReminderSends.$inferSelect;
export type NewEventEmailReminderSend = typeof eventEmailReminderSends.$inferInsert;

// Enum value types - use these for typed parameters and casts
export type RegistrationStatus = (typeof registrationStatusEnum.enumValues)[number];
export type EmailRecipientStatus = (typeof emailRecipientStatusEnum.enumValues)[number];
export type EmailAudienceType = (typeof emailAudienceTypeEnum.enumValues)[number];
export type EmailOutboxKind = (typeof emailOutboxKindEnum.enumValues)[number];
export type EmailOutboxStatus = (typeof emailOutboxStatusEnum.enumValues)[number];
export type InboundThreadingSource = (typeof inboundThreadingSourceEnum.enumValues)[number];
export type InboundForwardStatus = (typeof inboundForwardStatusEnum.enumValues)[number];
export type EventStatus = (typeof eventStatusEnum.enumValues)[number];
export type EventEditLog = typeof eventEditLog.$inferSelect;
export type NewEventEditLog = typeof eventEditLog.$inferInsert;
