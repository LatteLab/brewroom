import 'server-only';

import { getSupabaseAdminClient } from './admin';
import {
  ALLOWED_IMAGE_TYPES,
  EVENT_PHOTO_LIMITS,
  EVENT_PHOTOS_BUCKET,
  imageExtensionForType,
} from './image-utils';

export interface UploadTicketRequest {
  mimeType: string;
  sizeBytes: number;
}

export interface UploadTicket {
  path: string;
  signedUrl: string;
  token: string;
}

/**
 * Mint short-lived (2h) signed upload URLs so the browser can PUT directly to Supabase Storage,
 * skipping the Vercel function body limit (1 MB Server Action default, 4.5 MB Hobby cap).
 * Bucket-level `allowed_mime_types` and `file_size_limit` are the real enforcer; the checks here
 * are fast-fail UX.
 */
export async function createEventPhotoUploadTickets(
  eventId: string,
  files: UploadTicketRequest[],
): Promise<UploadTicket[]> {
  if (files.length === 0) return [];
  if (files.length > EVENT_PHOTO_LIMITS.maxBatchSize) {
    throw new Error(`Upload ${EVENT_PHOTO_LIMITS.maxBatchSize} photos or fewer at a time`);
  }

  for (const file of files) {
    if (!ALLOWED_IMAGE_TYPES.includes(file.mimeType)) {
      throw new Error(`Only ${EVENT_PHOTO_LIMITS.allowedExtensionsLabel} images are allowed`);
    }
    if (!Number.isFinite(file.sizeBytes) || file.sizeBytes <= 0) {
      throw new Error('Invalid file size');
    }
    if (file.sizeBytes > EVENT_PHOTO_LIMITS.maxSizeBytes) {
      throw new Error(`Image must be under ${EVENT_PHOTO_LIMITS.maxSizeLabel}`);
    }
  }

  const storage = getSupabaseAdminClient().storage.from(EVENT_PHOTOS_BUCKET);

  return Promise.all(
    files.map(async (file) => {
      const path = `events/${eventId}/${crypto.randomUUID()}.${imageExtensionForType(file.mimeType)}`;
      const { data, error } = await storage.createSignedUploadUrl(path);
      if (error || !data) throw new Error(`Failed to mint upload URL: ${error?.message ?? 'unknown'}`);
      return { path: data.path, signedUrl: data.signedUrl, token: data.token };
    }),
  );
}

export function getEventPhotoPublicUrl(path: string): string {
  const { data } = getSupabaseAdminClient()
    .storage
    .from(EVENT_PHOTOS_BUCKET)
    .getPublicUrl(path);
  return data.publicUrl;
}

export async function deleteEventPhotoObject(path: string): Promise<void> {
  if (!path) return;

  const { error } = await getSupabaseAdminClient()
    .storage
    .from(EVENT_PHOTOS_BUCKET)
    .remove([path]);

  if (error) throw new Error(`Delete failed: ${error.message}`);
}
