export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export const EVENT_PHOTOS_BUCKET = 'event-photos';

export const EVENT_PHOTO_LIMITS = {
  maxSizeBytes: 10 * 1024 * 1024,
  maxSizeLabel: '10MB',
  allowedTypes: ALLOWED_IMAGE_TYPES,
  allowedExtensionsLabel: 'JPEG, PNG, WebP, GIF',
  maxBatchSize: 10,
} as const;

export const EVENT_COVER_MAX_SIZE = 5 * 1024 * 1024;

export function imageExtensionForType(type: string): string {
  const extMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  return extMap[type] ?? 'jpg';
}

function asciiEquals(bytes: Uint8Array, offset: number, value: string): boolean {
  if (bytes.length < offset + value.length) return false;
  for (let i = 0; i < value.length; i += 1) {
    if (bytes[offset + i] !== value.charCodeAt(i)) return false;
  }
  return true;
}

export function validateImageMagicBytes(bytes: Uint8Array): void {
  const isJpeg = bytes[0] === 0xFF && bytes[1] === 0xD8;
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47;
  const isWebp = asciiEquals(bytes, 8, 'WEBP');
  const isGif = asciiEquals(bytes, 0, 'GIF87a') || asciiEquals(bytes, 0, 'GIF89a');

  if (!isJpeg && !isPng && !isWebp && !isGif) {
    throw new Error('File content does not match a supported image format');
  }
}
