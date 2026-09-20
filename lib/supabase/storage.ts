import { supabase } from './client';
import {
  ALLOWED_IMAGE_TYPES,
  EVENT_COVER_MAX_SIZE,
  imageExtensionForType,
  validateImageMagicBytes,
} from './image-utils';

export async function uploadEventCover(file: File): Promise<string> {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw new Error('Only JPEG, PNG, WebP, and GIF images are allowed');
  }
  if (file.size > EVENT_COVER_MAX_SIZE) {
    throw new Error('Image must be under 5MB');
  }

  // Validate actual file bytes; file.type is browser-supplied and can be spoofed.
  validateImageMagicBytes(new Uint8Array(await file.arrayBuffer()));

  const fileName = `${crypto.randomUUID()}.${imageExtensionForType(file.type)}`;

  const { error } = await supabase.storage
    .from('event-covers')
    .upload(fileName, file, { contentType: file.type });

  if (error) throw new Error(`Upload failed: ${error.message}`);

  const { data } = supabase.storage
    .from('event-covers')
    .getPublicUrl(fileName);

  return data.publicUrl;
}

export async function deleteEventCover(url: string): Promise<void> {
  const path = url.split('/event-covers/').pop();
  if (!path) return;

  await supabase.storage.from('event-covers').remove([path]);
}

export async function uploadProfileImage(userId: string, blob: Blob): Promise<string> {
  const fileName = `${userId}-${crypto.randomUUID()}.webp`;

  const { error } = await supabase.storage
    .from('profile-images')
    .upload(fileName, blob, {
      contentType: 'image/webp',
    });

  if (error) throw new Error(`Upload failed: ${error.message}`);

  const { data } = supabase.storage
    .from('profile-images')
    .getPublicUrl(fileName);

  // Append cache-buster so the browser doesn't serve stale image.
  return `${data.publicUrl}?t=${Date.now()}`;
}

export async function deleteProfileImage(url: string): Promise<void> {
  const path = url.split('/profile-images/').pop()?.split('?')[0];
  if (!path) return;
  await supabase.storage.from('profile-images').remove([path]);
}
