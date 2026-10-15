import { db } from './index';
import { emailBlasts, emailRecipients, users, eventRegistrations, events } from './schema';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import type { EmailBlast, NewEmailBlast, NewEmailRecipient, EmailRecipientStatus, RegistrationStatus } from './schema';
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
  status: EmailRecipientStatus,
): Promise<void> {
  await db
    .update(emailRecipients)
    .set({ status, statusUpdatedAt: new Date() })
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
      const conditions = [
        eq(eventRegistrations.eventId, filters.eventId),
        sql`${users.email} IS NOT NULL`,
      ];
      if (filters.registrationStatus) {
        conditions.push(eq(eventRegistrations.status, filters.registrationStatus as RegistrationStatus));
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
        .where(and(
          inArray(users.id, filters.userIds),
          sql`${users.email} IS NOT NULL`,
        ));
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
