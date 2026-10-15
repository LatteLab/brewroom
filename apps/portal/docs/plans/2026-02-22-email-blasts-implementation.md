# Email Blasts Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add email blast functionality so admins can compose and send emails to all members, event registrants, semester-status groups, or hand-picked users, with full delivery tracking via Resend webhooks.

**Architecture:** Single-table blast model with JSON audience filters. Resend SDK for sending (batch of 100), Resend webhooks for delivery tracking. Tiptap editor reuse for composition. No queue layer.

**Tech Stack:** Next.js 16 (App Router), Drizzle ORM, Resend SDK (`resend@6.5.2` already installed), Tiptap, shadcn/ui, Zod

**Design doc:** `docs/plans/2026-02-22-email-blasts-design.md`

---

### Task 1: Database Schema — Enums and Tables

**Files:**
- Modify: `lib/db/schema.ts` (append after line 135, before type exports)

**Step 1: Add enums and tables to schema**

Add these enums after the existing `lotteryStatusEnum` (line 14):

```typescript
export const emailBlastStatusEnum = pgEnum('email_blast_status', ['draft', 'sending', 'sent', 'failed']);
export const emailAudienceTypeEnum = pgEnum('email_audience_type', ['all', 'event', 'semester_status', 'manual']);
export const emailRecipientStatusEnum = pgEnum('email_recipient_status', ['queued', 'sent', 'delivered', 'bounced', 'failed']);
```

Add these tables after the `semesters` table (after line 135):

```typescript
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
```

Add type exports after the existing type exports (after line 156):

```typescript
export type EmailBlast = typeof emailBlasts.$inferSelect;
export type NewEmailBlast = typeof emailBlasts.$inferInsert;
export type EmailRecipient = typeof emailRecipients.$inferSelect;
export type NewEmailRecipient = typeof emailRecipients.$inferInsert;
```

**Step 2: Push schema to database**

Run: `pnpm db:push`
Expected: Tables `email_blasts` and `email_recipients` created, three new enums created. No errors.

**Step 3: Verify build**

Run: `pnpm build`
Expected: Build succeeds with no type errors.

**Step 4: Commit**

```bash
git add lib/db/schema.ts
git commit -m "feat(email): add email_blasts and email_recipients schema"
```

---

### Task 2: Types and Validation

**Files:**
- Create: `lib/types/email.ts`
- Create: `lib/validations/email.ts`

**Step 1: Create email types**

Create `lib/types/email.ts`:

```typescript
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
  email: string;
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
```

**Step 2: Create email validation schemas**

Create `lib/validations/email.ts`:

```typescript
import { z } from 'zod';

const audienceFilterSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('all') }),
  z.object({
    type: z.literal('event'),
    eventId: z.string().uuid(),
    registrationStatus: z.string().nullable().optional(),
  }),
  z.object({
    type: z.literal('semester_status'),
    semesterStatus: z.string().min(1),
  }),
  z.object({
    type: z.literal('manual'),
    userIds: z.array(z.string()).min(1, 'Select at least one recipient'),
  }),
]);

export const createEmailBlastSchema = z.object({
  subject: z.string().min(1, 'Subject is required').max(255),
  bodyTemplate: z.string().min(1, 'Email body is required'),
  audienceType: z.enum(['all', 'event', 'semester_status', 'manual']),
  audienceFilters: audienceFilterSchema,
});

export const sendEmailBlastSchema = z.object({
  blastId: z.string().uuid(),
});

export type CreateEmailBlastInput = z.infer<typeof createEmailBlastSchema>;
```

**Step 3: Verify build**

Run: `pnpm build`
Expected: No type errors.

**Step 4: Commit**

```bash
git add lib/types/email.ts lib/validations/email.ts
git commit -m "feat(email): add email types and Zod validation schemas"
```

---

### Task 3: Email Queries Module

**Files:**
- Create: `lib/db/email-queries.ts`
- Modify: `lib/db/index.ts` (add export)

**Step 1: Create email queries**

Create `lib/db/email-queries.ts`:

```typescript
import { db } from './index';
import { emailBlasts, emailRecipients, users, eventRegistrations, events } from './schema';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import type { EmailBlast, NewEmailBlast, NewEmailRecipient } from './schema';
import type { ResolvedRecipient, BlastWithStats, RecipientWithUser, AudienceFilter } from '@/lib/types/email';

// ============================================================================
// Blast CRUD
// ============================================================================

export async function getEmailBlasts(): Promise<BlastWithStats[]> {
  const blasts = await db.select().from(emailBlasts).orderBy(desc(emailBlasts.createdAt));

  // Aggregate recipient stats per blast
  const blastIds = blasts.map((b) => b.id);
  if (blastIds.length === 0) return [];

  const recipientStats = await db
    .select({
      blastId: emailRecipients.blastId,
      status: emailRecipients.status,
      count: sql<number>`count(*)::int`,
    })
    .from(emailRecipients)
    .where(inArray(emailRecipients.blastId, blastIds))
    .groupBy(emailRecipients.blastId, emailRecipients.status);

  const statsMap = new Map<string, BlastWithStats['stats']>();
  for (const row of recipientStats) {
    if (!statsMap.has(row.blastId)) {
      statsMap.set(row.blastId, { queued: 0, sent: 0, delivered: 0, bounced: 0, failed: 0 });
    }
    const s = statsMap.get(row.blastId)!;
    s[row.status as keyof typeof s] = row.count;
  }

  return blasts.map((blast) => ({
    ...blast,
    stats: statsMap.get(blast.id) ?? { queued: 0, sent: 0, delivered: 0, bounced: 0, failed: 0 },
  }));
}

export async function getEmailBlastById(id: string): Promise<EmailBlast | null> {
  const [blast] = await db.select().from(emailBlasts).where(eq(emailBlasts.id, id)).limit(1);
  return blast || null;
}

export async function createEmailBlast(data: NewEmailBlast): Promise<EmailBlast> {
  const [blast] = await db.insert(emailBlasts).values(data).returning();
  return blast;
}

export async function updateEmailBlast(id: string, data: Partial<NewEmailBlast>): Promise<EmailBlast> {
  const [blast] = await db
    .update(emailBlasts)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(emailBlasts.id, id))
    .returning();
  return blast;
}

export async function deleteEmailBlast(id: string): Promise<void> {
  await db.delete(emailBlasts).where(eq(emailBlasts.id, id));
}

// ============================================================================
// Recipient Queries
// ============================================================================

export async function getBlastRecipients(blastId: string): Promise<RecipientWithUser[]> {
  const rows = await db
    .select({
      id: emailRecipients.id,
      blastId: emailRecipients.blastId,
      userId: emailRecipients.userId,
      email: emailRecipients.email,
      resendEmailId: emailRecipients.resendEmailId,
      status: emailRecipients.status,
      statusUpdatedAt: emailRecipients.statusUpdatedAt,
      createdAt: emailRecipients.createdAt,
      userName: users.name,
    })
    .from(emailRecipients)
    .innerJoin(users, eq(emailRecipients.userId, users.id))
    .where(eq(emailRecipients.blastId, blastId))
    .orderBy(emailRecipients.createdAt);

  return rows;
}

export async function createEmailRecipients(data: NewEmailRecipient[]): Promise<void> {
  if (data.length === 0) return;
  await db.insert(emailRecipients).values(data);
}

export async function updateRecipientStatus(
  resendEmailId: string,
  status: string,
): Promise<void> {
  await db
    .update(emailRecipients)
    .set({ status: status as any, statusUpdatedAt: new Date() })
    .where(eq(emailRecipients.resendEmailId, resendEmailId));
}

export async function updateRecipientsByIds(
  ids: string[],
  data: Partial<NewEmailRecipient>,
): Promise<void> {
  if (ids.length === 0) return;
  await db.update(emailRecipients).set(data).where(inArray(emailRecipients.id, ids));
}

// ============================================================================
// Audience Resolution
// ============================================================================

export async function resolveAudience(filters: AudienceFilter): Promise<ResolvedRecipient[]> {
  switch (filters.type) {
    case 'all':
      return db
        .select({ userId: users.id, email: users.email, name: users.name })
        .from(users)
        .where(sql`${users.email} IS NOT NULL`);

    case 'event': {
      const conditions = [eq(eventRegistrations.eventId, filters.eventId)];
      if (filters.registrationStatus) {
        conditions.push(eq(eventRegistrations.status, filters.registrationStatus as any));
      }
      return db
        .select({ userId: users.id, email: users.email, name: users.name })
        .from(eventRegistrations)
        .innerJoin(users, eq(eventRegistrations.userId, users.id))
        .where(and(...conditions));
    }

    case 'semester_status':
      return db
        .select({ userId: users.id, email: users.email, name: users.name })
        .from(users)
        .where(and(
          eq(users.semesterStatus, filters.semesterStatus),
          sql`${users.email} IS NOT NULL`,
        ));

    case 'manual':
      return db
        .select({ userId: users.id, email: users.email, name: users.name })
        .from(users)
        .where(inArray(users.id, filters.userIds));
  }
}

export async function getAudienceCount(filters: AudienceFilter): Promise<number> {
  const recipients = await resolveAudience(filters);
  return recipients.filter((r) => r.email).length;
}

// ============================================================================
// Helpers for Composer Dropdowns
// ============================================================================

/** Get all events for the audience picker event dropdown */
export async function getEventsForEmailPicker() {
  return db
    .select({ id: events.id, name: events.name, date: events.date })
    .from(events)
    .orderBy(desc(events.date));
}

/** Get distinct semester statuses for the audience picker */
export async function getDistinctSemesterStatuses(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ semesterStatus: users.semesterStatus })
    .from(users)
    .where(sql`${users.semesterStatus} IS NOT NULL`);
  return rows.map((r) => r.semesterStatus!);
}

/** Search users for manual selection picker */
export async function searchUsersForPicker(query: string, limit = 20) {
  return db
    .select({ id: users.id, name: users.name, email: users.email, image: users.image })
    .from(users)
    .where(sql`(${users.name} ILIKE ${'%' + query + '%'} OR ${users.email} ILIKE ${'%' + query + '%'})`)
    .limit(limit);
}
```

**Step 2: Add export to `lib/db/index.ts`**

Add this line at the end of `lib/db/index.ts`:

```typescript
export * from './email-queries';
```

**Step 3: Verify build**

Run: `pnpm build`
Expected: No type errors.

**Step 4: Commit**

```bash
git add lib/db/email-queries.ts lib/db/index.ts
git commit -m "feat(email): add email queries module with audience resolution"
```

---

### Task 4: Email Template (HTML)

**Files:**
- Create: `lib/emails/blast-template.ts`

**Note:** React Email is not installed and would add a dependency. Since we have one simple template (wrap admin HTML in branded header/footer), use a plain HTML function instead. This avoids adding `@react-email/components` as a dependency.

**Step 1: Create the blast email template**

Create `lib/emails/blast-template.ts`:

```typescript
/**
 * Wraps admin-authored HTML content in a branded Latte Lab email layout.
 * Returns a complete HTML email string ready to send via Resend.
 */
export function renderBlastEmail(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Latte Lab</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="padding:24px 32px;background-color:#18181b;color:#ffffff;font-size:18px;font-weight:600;">
              Latte Lab
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;font-size:15px;line-height:1.6;color:#27272a;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 32px;border-top:1px solid #e4e4e7;font-size:12px;color:#a1a1aa;text-align:center;">
              Latte Lab &middot; MIT
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Resolves merge fields in email HTML content.
 * Supported: {{firstName}}, {{lastName}}, {{eventName}}
 * Unknown merge fields are stripped silently.
 */
export function resolveMergeFields(
  html: string,
  data: { firstName?: string; lastName?: string; eventName?: string },
): string {
  return html
    .replace(/\{\{firstName\}\}/g, data.firstName || 'Member')
    .replace(/\{\{lastName\}\}/g, data.lastName || '')
    .replace(/\{\{eventName\}\}/g, data.eventName || '')
    .replace(/\{\{[^}]+\}\}/g, ''); // Strip unknown merge fields
}
```

**Step 2: Verify build**

Run: `pnpm build`
Expected: No errors.

**Step 3: Commit**

```bash
git add lib/emails/blast-template.ts
git commit -m "feat(email): add blast email template with merge field resolution"
```

---

### Task 5: Server Actions — Email CRUD and Sending

**Files:**
- Create: `app/actions/email.ts`

**Step 1: Create email server actions**

Create `app/actions/email.ts`:

```typescript
'use server';

import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';
import { Resend } from 'resend';
import {
  createEmailBlast,
  updateEmailBlast,
  getEmailBlastById,
  deleteEmailBlast,
  resolveAudience,
  createEmailRecipients,
  getAudienceCount,
  getEventsForEmailPicker,
  getDistinctSemesterStatuses,
  searchUsersForPicker,
  getEmailBlasts,
  getBlastRecipients,
  updateRecipientsByIds,
} from '@/lib/db/email-queries';
import { getEventById } from '@/lib/db/event-queries';
import { createEmailBlastSchema } from '@/lib/validations/email';
import { renderBlastEmail, resolveMergeFields } from '@/lib/emails/blast-template';
import type { AudienceFilter, ResolvedRecipient } from '@/lib/types/email';

const resend = new Resend(process.env.RESEND_API_KEY);

// ============================================================================
// Blast CRUD Actions
// ============================================================================

export async function saveEmailBlastAction(data: {
  id?: string;
  subject: string;
  bodyTemplate: string;
  audienceType: string;
  audienceFilters: AudienceFilter;
}) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const parsed = createEmailBlastSchema.parse(data);
  const filtersJson = JSON.stringify(parsed.audienceFilters);

  if (data.id) {
    const blast = await updateEmailBlast(data.id, {
      subject: parsed.subject,
      bodyTemplate: parsed.bodyTemplate,
      body: parsed.bodyTemplate, // Will be re-rendered with merge fields at send time
      audienceType: parsed.audienceType as any,
      audienceFilters: filtersJson,
    });
    revalidatePath('/admin/email');
    revalidatePath(`/admin/email/${data.id}`);
    return blast;
  }

  const blast = await createEmailBlast({
    subject: parsed.subject,
    body: parsed.bodyTemplate,
    bodyTemplate: parsed.bodyTemplate,
    audienceType: parsed.audienceType as any,
    audienceFilters: filtersJson,
    status: 'draft',
    sentBy: session.user.id,
  });

  revalidatePath('/admin/email');
  return blast;
}

export async function deleteEmailBlastAction(blastId: string) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const blast = await getEmailBlastById(blastId);
  if (!blast) throw new Error('Blast not found');
  if (blast.status === 'sending' || blast.status === 'sent') {
    throw new Error('Cannot delete a sent blast');
  }

  await deleteEmailBlast(blastId);
  revalidatePath('/admin/email');
}

// ============================================================================
// Sending
// ============================================================================

export async function sendEmailBlastAction(blastId: string) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const blast = await getEmailBlastById(blastId);
  if (!blast) throw new Error('Blast not found');
  if (blast.status === 'sending' || blast.status === 'sent') {
    throw new Error('Blast already sent');
  }

  // Mark as sending
  await updateEmailBlast(blastId, { status: 'sending' });

  try {
    const filters: AudienceFilter = JSON.parse(blast.audienceFilters);
    const recipients = await resolveAudience(filters);
    const validRecipients = recipients.filter((r) => r.email);

    if (validRecipients.length === 0) {
      await updateEmailBlast(blastId, { status: 'failed' });
      throw new Error('No valid recipients found');
    }

    // Get event name for merge fields if event-scoped
    let eventName: string | undefined;
    if (filters.type === 'event') {
      const event = await getEventById(filters.eventId);
      eventName = event?.name;
    }

    // Create recipient rows
    await createEmailRecipients(
      validRecipients.map((r) => ({
        blastId,
        userId: r.userId,
        email: r.email!,
        status: 'queued' as const,
      })),
    );

    // Send in chunks of 100
    const CHUNK_SIZE = 100;
    let totalSent = 0;

    for (let i = 0; i < validRecipients.length; i += CHUNK_SIZE) {
      const chunk = validRecipients.slice(i, i + CHUNK_SIZE);

      try {
        const emails = chunk.map((recipient) => {
          const firstName = recipient.name?.split(' ')[0];
          const lastName = recipient.name?.split(' ').slice(1).join(' ');
          const resolvedHtml = resolveMergeFields(blast.bodyTemplate || blast.body, {
            firstName,
            lastName,
            eventName,
          });

          return {
            from: process.env.EMAIL_FROM || 'Latte Lab <noreply@lattelab.mit.edu>',
            to: recipient.email!,
            subject: blast.subject,
            html: renderBlastEmail(resolvedHtml),
          };
        });

        const { data: batchResult } = await resend.batch.send(emails);

        // Update recipient rows with Resend email IDs
        if (batchResult?.data) {
          for (let j = 0; j < batchResult.data.length; j++) {
            const recipientEmail = chunk[j].email;
            const resendId = batchResult.data[j].id;
            // Update by matching blast + email since we just created these rows
            const { db } = await import('@/lib/db');
            const { emailRecipients: recipientsTable } = await import('@/lib/db/schema');
            const { eq, and } = await import('drizzle-orm');
            await db
              .update(recipientsTable)
              .set({ resendEmailId: resendId, status: 'sent' as any })
              .where(
                and(
                  eq(recipientsTable.blastId, blastId),
                  eq(recipientsTable.email, recipientEmail!),
                ),
              );
          }
        }

        totalSent += chunk.length;
      } catch (chunkError) {
        // Mark this chunk's recipients as failed, continue with rest
        console.error(`Blast ${blastId}: chunk ${i} failed`, chunkError);
        const failedEmails = chunk.map((r) => r.email!);
        const { db } = await import('@/lib/db');
        const { emailRecipients: recipientsTable } = await import('@/lib/db/schema');
        const { eq, and, inArray } = await import('drizzle-orm');
        await db
          .update(recipientsTable)
          .set({ status: 'failed' as any, statusUpdatedAt: new Date() })
          .where(
            and(
              eq(recipientsTable.blastId, blastId),
              inArray(recipientsTable.email, failedEmails),
            ),
          );
      }
    }

    // Mark blast as sent
    await updateEmailBlast(blastId, {
      status: 'sent',
      sentAt: new Date(),
      totalRecipients: totalSent,
    });
  } catch (error) {
    // If the whole operation fails (not a chunk failure), mark as failed
    const blast = await getEmailBlastById(blastId);
    if (blast?.status === 'sending') {
      await updateEmailBlast(blastId, { status: 'failed' });
    }
    throw error;
  }

  revalidatePath('/admin/email');
  revalidatePath(`/admin/email/${blastId}`);
}

export async function sendPreviewEmailAction(blastId: string) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const blast = await getEmailBlastById(blastId);
  if (!blast) throw new Error('Blast not found');

  const filters: AudienceFilter = JSON.parse(blast.audienceFilters);
  let eventName: string | undefined;
  if (filters.type === 'event') {
    const event = await getEventById(filters.eventId);
    eventName = event?.name;
  }

  const resolvedHtml = resolveMergeFields(blast.bodyTemplate || blast.body, {
    firstName: session.user.name?.split(' ')[0] || 'Preview',
    lastName: session.user.name?.split(' ').slice(1).join(' ') || 'User',
    eventName,
  });

  await resend.emails.send({
    from: process.env.EMAIL_FROM || 'Latte Lab <noreply@lattelab.mit.edu>',
    to: session.user.email!,
    subject: `[PREVIEW] ${blast.subject}`,
    html: renderBlastEmail(resolvedHtml),
  });
}

// ============================================================================
// Data Fetching Actions (for client components)
// ============================================================================

export async function getAudienceCountAction(filters: AudienceFilter) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');
  return getAudienceCount(filters);
}

export async function getEventsForPickerAction() {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');
  return getEventsForEmailPicker();
}

export async function getSemesterStatusesAction() {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');
  return getDistinctSemesterStatuses();
}

export async function searchUsersAction(query: string) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');
  return searchUsersForPicker(query);
}

export async function getEmailBlastsAction() {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');
  return getEmailBlasts();
}

export async function getEmailBlastDetailAction(blastId: string) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const blast = await getEmailBlastById(blastId);
  if (!blast) return null;

  const recipients = await getBlastRecipients(blastId);
  return { blast, recipients };
}
```

**Step 2: Verify build**

Run: `pnpm build`
Expected: No type errors.

**Step 3: Commit**

```bash
git add app/actions/email.ts
git commit -m "feat(email): add server actions for blast CRUD, sending, and preview"
```

---

### Task 6: Resend Webhook Handler

**Files:**
- Create: `app/api/webhooks/resend/route.ts`

**Step 1: Create webhook route**

Create `app/api/webhooks/resend/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { updateRecipientStatus } from '@/lib/db/email-queries';

export async function POST(req: NextRequest) {
  try {
    // Verify webhook signature
    const svixId = req.headers.get('svix-id');
    const svixTimestamp = req.headers.get('svix-timestamp');
    const svixSignature = req.headers.get('svix-signature');

    if (!svixId || !svixTimestamp || !svixSignature) {
      return NextResponse.json({ error: 'Missing signature headers' }, { status: 401 });
    }

    // TODO: Implement full Svix signature verification with RESEND_WEBHOOK_SECRET
    // For now, check that the headers are present. In production, use the Svix library:
    // import { Webhook } from 'svix';
    // const wh = new Webhook(process.env.RESEND_WEBHOOK_SECRET!);
    // wh.verify(body, headers);

    const body = await req.json();
    const { type, data } = body;

    // Map Resend event types to our status
    const statusMap: Record<string, string> = {
      'email.sent': 'sent',
      'email.delivered': 'delivered',
      'email.delivery_delayed': 'sent', // Keep as sent
      'email.bounced': 'bounced',
      'email.complained': 'bounced',
    };

    const newStatus = statusMap[type];
    if (!newStatus || !data?.email_id) {
      return NextResponse.json({ ok: true }); // Ignore unhandled events
    }

    await updateRecipientStatus(data.email_id, newStatus);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Resend webhook error:', error);
    return NextResponse.json({ error: 'Processing error' }, { status: 500 });
  }
}
```

**Step 2: Verify build**

Run: `pnpm build`
Expected: No errors.

**Step 3: Commit**

```bash
git add app/api/webhooks/resend/route.ts
git commit -m "feat(email): add Resend webhook handler for delivery tracking"
```

---

### Task 7: Admin Sidebar — Add Email Nav Item

**Files:**
- Modify: `components/admin/admin-sidebar.tsx`

**Step 1: Add Mail import and nav item**

In `components/admin/admin-sidebar.tsx`:

Add `Mail` to the lucide-react import on line 3:

```typescript
import { LayoutDashboard, Users, LogOut, Settings, Calendar, ArrowRightLeft, Mail } from "lucide-react";
```

Add the Email nav item to the `navItems` array (between Events and Users):

```typescript
const navItems = [
  {
    title: "Dashboard",
    url: "/admin",
    icon: LayoutDashboard,
  },
  {
    title: "Events",
    url: "/admin/events",
    icon: Calendar,
  },
  {
    title: "Email",
    url: "/admin/email",
    icon: Mail,
  },
  {
    title: "Users",
    url: "/admin/users",
    icon: Users,
  },
  {
    title: "Settings",
    url: "/admin/settings",
    icon: Settings,
  },
];
```

**Step 2: Verify build**

Run: `pnpm build`
Expected: No errors (pages don't exist yet but sidebar renders fine).

**Step 3: Commit**

```bash
git add components/admin/admin-sidebar.tsx
git commit -m "feat(email): add Email nav item to admin sidebar"
```

---

### Task 8: Email Hub Page (`/admin/email`)

**Files:**
- Create: `app/(admin)/admin/email/page.tsx`
- Create: `components/admin/email-blast-list.tsx`

**Step 1: Create the email hub list component**

Create `components/admin/email-blast-list.tsx` — a client component that renders the table of past blasts. Each row shows: subject, audience summary, status badge, sent date, delivery stats (delivered/bounced/failed), and a link to detail.

Use the existing patterns from `components/admin/` — Badge for status, Link for navigation, format dates with `toLocaleDateString()`.

Columns: Subject, Audience, Status, Sent, Delivered, Actions (View link).

Audience summary logic:
- `all` → "All Members"
- `event` → "Event: {eventName}" (parse from audienceFilters JSON, may need event name lookup — or just show "Event registrants" for simplicity)
- `semester_status` → "{semesterStatus}"
- `manual` → "{N} selected users"

**Step 2: Create the email hub page**

Create `app/(admin)/admin/email/page.tsx` — server component that fetches blasts via `getEmailBlasts()` and renders a page header with "Compose" button + the list component.

Follow the page pattern from `app/(admin)/admin/events/page.tsx`:
- Auth check
- Fetch data
- PageHeader with title + action button
- Render list component

**Step 3: Verify build**

Run: `pnpm build`
Expected: Page builds and is accessible at `/admin/email`.

**Step 4: Commit**

```bash
git add app/(admin)/admin/email/page.tsx components/admin/email-blast-list.tsx
git commit -m "feat(email): add email hub page with blast list"
```

---

### Task 9: Email Composer Page (`/admin/email/compose`)

This is the largest task. Split into sub-components.

**Files:**
- Create: `app/(admin)/admin/email/compose/page.tsx`
- Create: `components/admin/email-composer.tsx`
- Create: `components/admin/audience-picker.tsx`
- Create: `components/admin/merge-field-dropdown.tsx`

**Step 1: Create the merge field dropdown**

Create `components/admin/merge-field-dropdown.tsx` — a small dropdown button that inserts merge field text at cursor position. Props: `onInsert: (field: string) => void`, `showEventName: boolean`. Renders a Popover or DropdownMenu with items: firstName, lastName, and conditionally eventName.

**Step 2: Create the audience picker**

Create `components/admin/audience-picker.tsx` — client component with:
- Radio group: All Members / Event / Semester Status / Manual
- Conditional sub-controls per type:
  - **All:** Just shows recipient count
  - **Event:** Event select dropdown (fetched via `getEventsForPickerAction()`), optional registration status dropdown
  - **Semester Status:** Select dropdown (fetched via `getSemesterStatusesAction()`)
  - **Manual:** Search input + user list with add/remove (uses `searchUsersAction()`)
- Live recipient count fetched via `getAudienceCountAction()`
- Props: `value: AudienceFilter`, `onChange: (filter: AudienceFilter) => void`

**Step 3: Create the email composer**

Create `components/admin/email-composer.tsx` — the main composer client component:
- State: subject, bodyTemplate (HTML from Tiptap), audienceFilter, blastId (if editing draft)
- Renders: AudiencePicker, subject Input, TiptapEditor with MergeFieldDropdown in toolbar, action buttons
- Actions: Save Draft (calls `saveEmailBlastAction`), Send Preview (calls `sendPreviewEmailAction`), Send Blast (confirmation dialog then `sendEmailBlastAction`)
- Uses `useTransition` for pending states, `toast` for success/error feedback

The Tiptap editor can be reused directly — just pass the merge field dropdown as an additional toolbar element. Two approaches:
1. Compose TiptapEditor + MergeFieldDropdown side by side in the toolbar area
2. Create an `EmailEditor` wrapper that includes both

Approach 1 is simpler — render MergeFieldDropdown next to the TiptapEditor toolbar.

For the confirmation dialog before sending, use shadcn `AlertDialog`.

**Step 4: Create the compose page**

Create `app/(admin)/admin/email/compose/page.tsx` — server component:
- Auth check
- Read `searchParams` for `audienceType` and `eventId` (pre-fill from event page link)
- Render PageHeader + EmailComposer with initial props

**Step 5: Verify build**

Run: `pnpm build`
Expected: Compose page builds and renders.

**Step 6: Verify manually**

Run: `pnpm dev`
- Navigate to `/admin/email/compose`
- Verify audience picker renders all 4 types
- Verify Tiptap editor loads with merge field dropdown
- Verify recipient count updates when changing audience
- Save a draft and verify it appears on `/admin/email`

**Step 7: Commit**

```bash
git add app/(admin)/admin/email/compose/page.tsx components/admin/email-composer.tsx components/admin/audience-picker.tsx components/admin/merge-field-dropdown.tsx
git commit -m "feat(email): add email composer with audience picker and merge fields"
```

---

### Task 10: Blast Detail Page (`/admin/email/[id]`)

**Files:**
- Create: `app/(admin)/admin/email/[id]/page.tsx`
- Create: `components/admin/email-blast-detail.tsx`

**Step 1: Create the blast detail component**

Create `components/admin/email-blast-detail.tsx` — client component showing:
- Blast metadata: subject, audience summary, status badge, sent date, sent by
- Delivery stats summary: 4 stat cards (sent, delivered, bounced, failed) with counts
- Recipient list table: name, email, status badge, status updated time
- If status is `draft`: show Edit and Send buttons

**Step 2: Create the detail page**

Create `app/(admin)/admin/email/[id]/page.tsx` — server component:
- Auth check
- Fetch blast + recipients via `getEmailBlastDetailAction(id)`
- `notFound()` if blast doesn't exist
- PageHeader with blast subject + BlastDetail component

Follow the pattern from `app/(admin)/admin/events/[id]/page.tsx`.

**Step 3: Verify build**

Run: `pnpm build`
Expected: No errors.

**Step 4: Commit**

```bash
git add app/(admin)/admin/email/[id]/page.tsx components/admin/email-blast-detail.tsx
git commit -m "feat(email): add blast detail page with recipient tracking"
```

---

### Task 11: Event Page Entry Point

**Files:**
- Modify: `components/admin/guest-list.tsx`

**Step 1: Add "Email Registrants" button**

In `components/admin/guest-list.tsx`, add a Link button that navigates to the composer pre-filled with the event's audience.

Add `Mail` to the lucide-react imports. Add the button in the guest list header area (near the existing search/filter controls).

```tsx
<Button variant="outline" size="sm" asChild>
  <Link href={`/admin/email/compose?audienceType=event&eventId=${event.id}`}>
    <Mail className="h-4 w-4 mr-2" />
    Email Registrants
  </Link>
</Button>
```

Find the appropriate place in the component's JSX — likely in the toolbar/header area above the registration list, alongside existing action buttons.

**Step 2: Verify build**

Run: `pnpm build`
Expected: No errors.

**Step 3: Verify manually**

Run: `pnpm dev`
- Navigate to any event detail page → Guests tab
- Click "Email Registrants"
- Should navigate to `/admin/email/compose?audienceType=event&eventId=<id>`
- Audience picker should be pre-filled with "Event" selected and the event chosen

**Step 4: Commit**

```bash
git add components/admin/guest-list.tsx
git commit -m "feat(email): add Email Registrants button on event guest list"
```

---

### Task 12: End-to-End Verification

**Files:** None (testing only)

**Step 1: Full build check**

Run: `pnpm build`
Expected: Clean build with no errors.

**Step 2: Manual smoke test**

Run: `pnpm dev` and test the full flow:

1. Navigate to `/admin/email` — should show empty blast list with "Compose" button
2. Click "Compose" — should load composer with audience picker, editor, and merge field dropdown
3. Select "All Members" audience — should show recipient count
4. Switch to "Event" — should show event dropdown, pick an event, see count update
5. Switch to "Semester Status" — should show dropdown of statuses
6. Switch to "Manual" — should show user search, add a few users
7. Write a subject and body with merge fields (`{{firstName}}`)
8. Click "Save as Draft" — should redirect to email hub with draft listed
9. Click into the draft detail page — should show blast info
10. From the event detail page, click "Email Registrants" — should open composer pre-filled

**Step 3: Test sending (requires RESEND_API_KEY)**

If `RESEND_API_KEY` is configured:
1. Save a draft blast
2. Click "Send Preview to Me" — should receive test email
3. Click "Send Blast" — should show confirmation, then send
4. Check blast detail page — should show recipient statuses updating

**Step 4: Final commit**

If any fixes were needed during testing, commit them:

```bash
git add -A
git commit -m "fix(email): address issues found during smoke testing"
```

---

## File Summary

### Files to Create (13)
| File | Purpose |
|------|---------|
| `lib/types/email.ts` | Type definitions and status color maps |
| `lib/validations/email.ts` | Zod validation schemas |
| `lib/db/email-queries.ts` | All database queries for email blasts |
| `lib/emails/blast-template.ts` | HTML email template + merge field resolver |
| `app/actions/email.ts` | Server actions for blast CRUD, sending, data fetching |
| `app/api/webhooks/resend/route.ts` | Resend webhook handler |
| `app/(admin)/admin/email/page.tsx` | Email hub page |
| `app/(admin)/admin/email/compose/page.tsx` | Composer page |
| `app/(admin)/admin/email/[id]/page.tsx` | Blast detail page |
| `components/admin/email-blast-list.tsx` | Blast list table component |
| `components/admin/email-composer.tsx` | Main composer component |
| `components/admin/audience-picker.tsx` | Audience type picker with sub-controls |
| `components/admin/merge-field-dropdown.tsx` | Merge field insertion dropdown |

### Files to Modify (3)
| File | Change |
|------|--------|
| `lib/db/schema.ts` | Add 3 enums, 2 tables, 4 type exports |
| `lib/db/index.ts` | Add `export * from './email-queries'` |
| `components/admin/admin-sidebar.tsx` | Add Email nav item with Mail icon |
| `components/admin/guest-list.tsx` | Add "Email Registrants" button |

### Environment Variables to Add (2)
| Variable | Purpose |
|----------|---------|
| `RESEND_API_KEY` | Resend API key for blast sending (separate from `AUTH_RESEND_KEY`) |
| `RESEND_WEBHOOK_SECRET` | Resend webhook signing secret |
