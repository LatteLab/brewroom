'use server';

import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';
import { Resend } from 'resend';
import { db } from '@/lib/db';
import { emailRecipients as emailRecipientsTable } from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
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
} from '@/lib/db/email-queries';
import { getEventById } from '@/lib/db/event-queries';
import { getUserById } from '@/lib/db/queries';
import { createEmailBlastSchema } from '@/lib/validations/email';
import { renderBlastEmail, resolveMergeFields } from '@/lib/emails/blast-template';
import type { AudienceFilter } from '@/lib/types/email';
import type { EmailAudienceType, EmailRecipientStatus } from '@/lib/db/schema';

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
      audienceType: parsed.audienceType as EmailAudienceType,
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
    audienceType: parsed.audienceType as EmailAudienceType,
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

    // Clear any existing recipients from a previous failed attempt
    await db.delete(emailRecipientsTable).where(eq(emailRecipientsTable.blastId, blastId));

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

        const { data: batchResult, error: batchError } = await resend.batch.send(emails);
        if (batchError) throw batchError;

        // Update recipient rows with Resend email IDs
        // batchResult is { data: { id: string }[] } — double-nested
        if (batchResult?.data) {
          for (let j = 0; j < batchResult.data.length; j++) {
            const recipientEmail = chunk[j].email;
            const resendId = batchResult.data[j].id;
            await db
              .update(emailRecipientsTable)
              .set({ resendEmailId: resendId, status: 'sent' as EmailRecipientStatus })
              .where(
                and(
                  eq(emailRecipientsTable.blastId, blastId),
                  eq(emailRecipientsTable.email, recipientEmail!),
                ),
              );
          }
        }

        totalSent += chunk.length;
      } catch (chunkError) {
        // Mark this chunk's recipients as failed, continue with rest
        console.error(`Blast ${blastId}: chunk ${i} failed`, chunkError);
        const failedEmails = chunk.map((r) => r.email!);
        await db
          .update(emailRecipientsTable)
          .set({ status: 'failed' as EmailRecipientStatus, statusUpdatedAt: new Date() })
          .where(
            and(
              eq(emailRecipientsTable.blastId, blastId),
              inArray(emailRecipientsTable.email, failedEmails),
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
    const currentBlast = await getEmailBlastById(blastId);
    if (currentBlast?.status === 'sending') {
      await updateEmailBlast(blastId, { status: 'failed' });
    }
    revalidatePath('/admin/email');
    revalidatePath(`/admin/email/${blastId}`);
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

  const [recipients, sender] = await Promise.all([
    getBlastRecipients(blastId),
    getUserById(blast.sentBy),
  ]);
  return { blast, recipients, senderName: sender?.name || null };
}

export async function getAudienceEmailsAction(filters: import('@/lib/types/email').AudienceFilter): Promise<string[]> {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error('Unauthorized');

  const recipients = await resolveAudience(filters);
  return recipients.map(r => r.email).filter((e): e is string => e !== null);
}
