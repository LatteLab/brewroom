'use server';

import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { emailOutbox, users } from '@/lib/db/schema';
import { desc, eq, and, gte, sql, type SQL } from 'drizzle-orm';
import type { EmailOutboxStatus, EmailOutboxKind } from '@/lib/db/schema';
import { retryOutboxRow } from '@/lib/emails/send';

export interface EmailLogFilters {
  template?: string;
  status?: EmailOutboxStatus;
  kind?: EmailOutboxKind;
  recipientUserId?: string;
  relatedEventId?: string;
  since?: string; // ISO date
}

export async function getEmailLogAction(filters: EmailLogFilters = {}, limit = 100) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const conditions: SQL[] = [];
  if (filters.template) conditions.push(eq(emailOutbox.template, filters.template));
  if (filters.status) conditions.push(eq(emailOutbox.status, filters.status));
  if (filters.kind) conditions.push(eq(emailOutbox.kind, filters.kind));
  if (filters.recipientUserId) conditions.push(eq(emailOutbox.recipientUserId, filters.recipientUserId));
  if (filters.relatedEventId) conditions.push(eq(emailOutbox.relatedEventId, filters.relatedEventId));
  if (filters.since) conditions.push(gte(emailOutbox.createdAt, new Date(filters.since)));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  return db
    .select({
      id: emailOutbox.id,
      kind: emailOutbox.kind,
      template: emailOutbox.template,
      recipientEmail: emailOutbox.recipientEmail,
      recipientName: users.name,
      subject: emailOutbox.subject,
      status: emailOutbox.status,
      attemptCount: emailOutbox.attemptCount,
      lastError: emailOutbox.lastError,
      sentAt: emailOutbox.sentAt,
      createdAt: emailOutbox.createdAt,
      relatedEventId: emailOutbox.relatedEventId,
    })
    .from(emailOutbox)
    .leftJoin(users, eq(users.id, emailOutbox.recipientUserId))
    .where(where)
    .orderBy(desc(emailOutbox.createdAt))
    .limit(limit);
}

export async function getEmailLogStatsAction() {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const [stats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      sent: sql<number>`count(*) filter (where status in ('sent','delivered'))::int`,
      delivered: sql<number>`count(*) filter (where status = 'delivered')::int`,
      failed: sql<number>`count(*) filter (where status = 'failed')::int`,
      bounced: sql<number>`count(*) filter (where status = 'bounced')::int`,
      queued: sql<number>`count(*) filter (where status = 'queued')::int`,
    })
    .from(emailOutbox);

  return stats;
}

export async function retryEmailLogRowAction(rowId: string) {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');
  const result = await retryOutboxRow(rowId);
  revalidatePath('/admin/email/log');
  return result;
}
