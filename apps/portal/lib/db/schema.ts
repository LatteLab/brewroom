import { pgTable, pgEnum, text, timestamp, uuid, primaryKey, integer, real, doublePrecision, unique, boolean, check, json, jsonb, index, uniqueIndex, foreignKey, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { AdapterAccountType } from 'next-auth/adapters';
import type { Configuration, MenuOptions } from '../validations/pos';
import type { EquipmentFields, ItemFields, RecipeBody } from '../validations/inventory';

// ============================================================================
// Enums
// ============================================================================

export const eventVisibilityEnum = pgEnum('event_visibility', ['private', 'public']);
export const eventStatusEnum = pgEnum('event_status', ['open', 'closed', 'completed']);
export const registrationStatusEnum = pgEnum('registration_status', [
  'registered', 'waitlisted', 'selected', 'rejected', 'checked_in', 'no_show', 'pending_approval', 'draft_selected', 'draft_rejected'
]);
export const lotteryOutcomeEnum = pgEnum('lottery_outcome', ['won', 'lost']);
export const plusOneInviteStatusEnum = pgEnum('plus_one_invite_status', ['pending', 'accepted']);
export const lotteryStatusEnum = pgEnum('lottery_status', ['draft', 'finalized']);
export const emailBlastStatusEnum = pgEnum('email_blast_status', ['draft', 'sending', 'sent', 'failed']);
export const emailAudienceTypeEnum = pgEnum('email_audience_type', ['all', 'event', 'semester_status', 'manual']);
export const emailRecipientStatusEnum = pgEnum('email_recipient_status', ['queued', 'sent', 'delivered', 'bounced', 'failed']);

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
});

// +1 invite table — tracks pairing invites between registered users
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

// Registration audit log — tracks every status change with actor info
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
  sentBy: text('sent_by').notNull().references(() => users.id),
  sentAt: timestamp('sent_at', { mode: 'date' }),
  totalRecipients: integer('total_recipients').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Email recipients table — per-recipient tracking for delivery status
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

// Event edit log — tracks field-level changes on every event update
export const eventEditLog = pgTable('event_edit_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  changedBy: text('changed_by').notNull().references(() => users.id),
  changedAt: timestamp('changed_at').defaultNow().notNull(),
  changes: json('changes').$type<Record<string, { old: unknown; new: unknown }>>().notNull(),
});

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

// Enum value types — use these for typed parameters and casts
export type RegistrationStatus = (typeof registrationStatusEnum.enumValues)[number];
export type EmailRecipientStatus = (typeof emailRecipientStatusEnum.enumValues)[number];
export type EmailAudienceType = (typeof emailAudienceTypeEnum.enumValues)[number];
export type EventEditLog = typeof eventEditLog.$inferSelect;
export type NewEventEditLog = typeof eventEditLog.$inferInsert;


export const posEvents = pgTable('pos_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true, mode: 'date' }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true, mode: 'date' }).notNull(),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, table => [check('pos_event_window', sql`${table.endsAt} > ${table.startsAt}`), check('pos_event_name', sql`length(trim(${table.name})) > 0`)]).enableRLS();

export const posMenuItems = pgTable('pos_event_menu_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id').notNull().references(() => posEvents.id),
  name: text('name').notNull(),
  options: jsonb('options').$type<MenuOptions>().notNull(),
  available: boolean('available').default(true).notNull(),
  archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
  sortOrder: integer('sort_order').default(0).notNull(),
  version: integer('version').default(1).notNull(),
}, table => [unique('pos_menu_event_id').on(table.eventId, table.id), index('pos_menu_sort').on(table.eventId, table.sortOrder), check('pos_menu_version', sql`${table.version} > 0`)]).enableRLS();

export const posDrinkLogs = pgTable('pos_drink_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id').notNull().references(() => posEvents.id),
  menuItemId: uuid('menu_item_id').notNull(),
  menuVersion: integer('menu_version').notNull(),
  drinkName: text('drink_name').notNull(),
  configuration: jsonb('configuration').$type<Configuration>().notNull(),
  espressoShots: integer('espresso_shots').default(2).notNull(),
  quantity: integer('quantity').notNull(),
  submissionId: uuid('submission_id').notNull(),
  lineIndex: integer('line_index').notNull(),
  requestHash: text('request_hash').notNull(),
  recordedAt: timestamp('recorded_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  recordedBy: text('recorded_by').notNull().references(() => users.id),
  kerb: text('kerb'),
  voidedAt: timestamp('voided_at', { withTimezone: true, mode: 'date' }),
  voidedBy: text('voided_by').references(() => users.id),
  voidReason: text('void_reason'),
  replacesLogId: uuid('replaces_log_id').references((): AnyPgColumn => posDrinkLogs.id),
  mutationId: uuid('mutation_id'),
  mutationHash: text('mutation_hash'),
}, table => [
  foreignKey({ name: 'pos_log_menu_event', columns: [table.eventId, table.menuItemId], foreignColumns: [posMenuItems.eventId, posMenuItems.id] }),
  check('pos_log_quantity', sql`${table.quantity} > 0`),
  check('pos_log_double', sql`${table.espressoShots} = 2`),
  check('pos_log_line', sql`${table.lineIndex} >= 0`),
  check('pos_log_void_metadata', sql`(${table.voidedAt} IS NULL AND ${table.voidedBy} IS NULL AND ${table.voidReason} IS NULL) OR (${table.voidedAt} IS NOT NULL AND ${table.voidedBy} IS NOT NULL AND ${table.voidReason} IS NOT NULL AND length(trim(${table.voidReason})) > 0)`),
  uniqueIndex('pos_original_submission_line').on(table.eventId, table.submissionId, table.lineIndex).where(sql`${table.replacesLogId} IS NULL`),
  uniqueIndex('pos_log_replacement').on(table.replacesLogId).where(sql`${table.replacesLogId} IS NOT NULL`),
  uniqueIndex('pos_log_mutation').on(table.mutationId).where(sql`${table.mutationId} IS NOT NULL`),
  index('pos_valid_logs_time').on(table.eventId, table.recordedAt).where(sql`${table.voidedAt} IS NULL`),
]).enableRLS();

export type PosEvent = typeof posEvents.$inferSelect;
export type PosMenuItem = typeof posMenuItems.$inferSelect;
export type PosDrinkLog = typeof posDrinkLogs.$inferSelect;

// ============================================================================
// Inventory (ported from LatteLab/inventory-system-draft)
// ============================================================================
// Separate `inventory_` tables. They read POS menu items and drink logs but never write to POS tables.

// One row per ingredient that recipes name. Quantity on hand is derived from its purchase options and open amount.
export const inventoryItems = pgTable('inventory_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull().unique('inventory_item_name'),
  category: text('category').$type<ItemFields['category']>().notNull(),
  unit: text('unit').$type<ItemFields['unit']>().notNull(),
  openAmount: doublePrecision('open_amount').default(0).notNull(),
  countedAt: timestamp('counted_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  par: doublePrecision('par').default(0).notNull(),
  notes: text('notes').default('').notNull(),
  version: integer('version').default(1).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedBy: text('updated_by').references(() => users.id),
}, table => [
  check('inventory_item_unit', sql`${table.unit} IN ('ml', 'g', 'each')`),
  check('inventory_item_name_present', sql`length(trim(${table.name})) > 0`),
  check('inventory_item_amounts', sql`${table.openAmount} >= 0 AND ${table.par} >= 0`),
  check('inventory_item_version', sql`${table.version} > 0`),
]).enableRLS();

// Ways of buying one ingredient: supplier, bag size and cost per bag differ, the ingredient and its count do not.
export const inventoryItemPackages = pgTable('inventory_item_packages', {
  id: uuid('id').defaultRandom().primaryKey(),
  itemId: uuid('item_id').notNull().references(() => inventoryItems.id, { onDelete: 'cascade' }),
  supplier: text('supplier').default('').notNull(),
  bagSize: doublePrecision('bag_size').notNull(),
  costPerBag: doublePrecision('cost_per_bag').default(0).notNull(),
  sealedBags: doublePrecision('sealed_bags').default(0).notNull(),
  preferred: boolean('preferred').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, table => [
  check('inventory_package_amounts', sql`${table.bagSize} > 0 AND ${table.costPerBag} >= 0 AND ${table.sealedBags} >= 0`),
  uniqueIndex('inventory_package_option').on(table.itemId, sql`lower(${table.supplier})`, table.bagSize),
  uniqueIndex('inventory_package_preferred').on(table.itemId).where(sql`${table.preferred}`),
]).enableRLS();

export const inventoryRecipes = pgTable('inventory_recipes', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: text('slug').notNull().unique('inventory_recipe_slug'),
  published: jsonb('published').$type<RecipeBody>(),
  draft: jsonb('draft').$type<RecipeBody>(),
  publishedVersion: integer('published_version').default(0).notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' }),
  publishedBy: text('published_by').references(() => users.id),
  version: integer('version').default(1).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedBy: text('updated_by').references(() => users.id),
}, table => [
  check('inventory_recipe_body', sql`${table.published} IS NOT NULL OR ${table.draft} IS NOT NULL`),
  check('inventory_recipe_version', sql`${table.version} > 0 AND ${table.publishedVersion} >= 0`),
]).enableRLS();

export const inventoryEquipment = pgTable('inventory_equipment', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull().unique('inventory_equipment_name'),
  category: text('category').$type<EquipmentFields['category']>().notNull(),
  quantity: integer('quantity').default(1).notNull(),
  status: text('status').$type<EquipmentFields['status']>().default('ok').notNull(),
  location: text('location').default('').notNull(),
  custodian: text('custodian').default('').notNull(),
  serial: text('serial').default('').notNull(),
  notes: text('notes').default('').notNull(),
  lastCheckedAt: text('last_checked_at').default('').notNull(),
  version: integer('version').default(1).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedBy: text('updated_by').references(() => users.id),
}, table => [
  check('inventory_equipment_status', sql`${table.status} IN ('ok', 'repair', 'loaned', 'missing', 'retired')`),
  check('inventory_equipment_quantity', sql`${table.quantity} >= 0`),
  check('inventory_equipment_name_present', sql`length(trim(${table.name})) > 0`),
  check('inventory_equipment_version', sql`${table.version} > 0`),
]).enableRLS();

// Overrides and plans for POS menu drinks. A drink with no row uses the published recipe matching its name.
// Cascades with the menu item so deleting a POS event is never blocked by inventory.
export const inventoryMenuLinks = pgTable('inventory_menu_links', {
  menuItemId: uuid('menu_item_id').primaryKey(),
  eventId: uuid('event_id').notNull(),
  recipeId: uuid('recipe_id').references(() => inventoryRecipes.id, { onDelete: 'set null' }),
  // False stops usage for this drink. True with no recipe uses the published recipe matching the drink's name.
  track: boolean('track').default(true).notNull(),
  plannedServings: integer('planned_servings').default(0).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedBy: text('updated_by').references(() => users.id),
}, table => [
  foreignKey({ name: 'inventory_link_menu_item', columns: [table.eventId, table.menuItemId], foreignColumns: [posMenuItems.eventId, posMenuItems.id] }).onDelete('cascade'),
  check('inventory_link_planned', sql`${table.plannedServings} >= 0`),
  index('inventory_link_event').on(table.eventId),
  index('inventory_link_recipe').on(table.recipeId),
]).enableRLS();

export type InventoryItem = typeof inventoryItems.$inferSelect;
export type InventoryItemPackage = typeof inventoryItemPackages.$inferSelect;
export type InventoryRecipe = typeof inventoryRecipes.$inferSelect;
export type InventoryEquipment = typeof inventoryEquipment.$inferSelect;
export type InventoryMenuLink = typeof inventoryMenuLinks.$inferSelect;
