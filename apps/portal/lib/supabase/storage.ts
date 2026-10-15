import { supabase } from './client';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_COVER_SIZE = 5 * 1024 * 1024; // 5MB

function validateImageMagicBytes(buf: Buffer): void {
  const isJpeg = buf[0] === 0xFF && buf[1] === 0xD8;
  const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
  const isWebp = buf.length >= 12 && buf.subarray(8, 12).toString('ascii') === 'WEBP';
  const isGif = buf.length >= 6 && (
    buf.subarray(0, 6).toString('ascii') === 'GIF87a' ||
    buf.subarray(0, 6).toString('ascii') === 'GIF89a'
  );
  if (!isJpeg && !isPng && !isWebp && !isGif) {
    throw new Error('File content does not match a supported image format');
  }
}

export async function uploadEventCover(file: File): Promise<string> {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw new Error('Only JPEG, PNG, WebP, and GIF images are allowed');
  }
  if (file.size > MAX_COVER_SIZE) {
    throw new Error('Image must be under 5MB');
  }

  // Validate actual file bytes — file.type is browser-supplied and can be spoofed
  const buffer = Buffer.from(await file.arrayBuffer());
  validateImageMagicBytes(buffer);

  const extMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  const ext = extMap[file.type] ?? 'jpg';
  const fileName = `${crypto.randomUUID()}.${ext}`;

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

  // Append cache-buster so the browser doesn't serve stale image
  return `${data.publicUrl}?t=${Date.now()}`;
}

export async function deleteProfileImage(url: string): Promise<void> {
  const path = url.split('/profile-images/').pop()?.split('?')[0];
  if (!path) return;
  await supabase.storage.from('profile-images').remove([path]);
}
