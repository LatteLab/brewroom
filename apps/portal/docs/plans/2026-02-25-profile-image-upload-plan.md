# Profile Image Upload Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let users upload, crop, and reposition a custom profile photo from the settings page.

**Architecture:** Client-side circular crop via `react-easy-crop` in a shadcn Dialog. Canvas produces a 256x256 WebP blob, uploaded to a new `profile-images` Supabase Storage bucket. The existing `users.image` text column stores the public URL — all avatar consumers already read from it.

**Tech Stack:** react-easy-crop, shadcn Dialog + Slider, Supabase Storage, Canvas API, server actions

---

### Task 1: Create Supabase Storage Bucket

**Context:** We need a `profile-images` bucket with public access. Matches the `event-covers` bucket pattern.

**Step 1: Create the bucket via Supabase MCP**

Use `mcp__supabase__execute_sql` with project ID `rlmgbbqyokizudzhfydp`:

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-images', 'profile-images', true)
ON CONFLICT (id) DO NOTHING;
```

**Step 2: Add RLS policies for anon uploads**

```sql
-- Allow public reads
CREATE POLICY "Public read profile images"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'profile-images');

-- Allow uploads (anon because client uses anon key)
CREATE POLICY "Allow profile image uploads"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'profile-images');

-- Allow overwrites/deletes
CREATE POLICY "Allow profile image updates"
ON storage.objects FOR UPDATE
TO anon, authenticated
USING (bucket_id = 'profile-images');

CREATE POLICY "Allow profile image deletes"
ON storage.objects FOR DELETE
TO anon, authenticated
USING (bucket_id = 'profile-images');
```

**Step 3: Verify bucket exists**

Use `mcp__supabase__execute_sql`:

```sql
SELECT id, name, public FROM storage.buckets WHERE id = 'profile-images';
```

---

### Task 2: Install Dependencies

**Step 1: Install react-easy-crop**

```bash
pnpm add react-easy-crop
```

**Step 2: Add shadcn Slider component**

The project already has Dialog but no Slider. Add it:

```bash
pnpm dlx shadcn@latest add slider
```

This creates `components/ui/slider.tsx`.

**Step 3: Verify installs**

```bash
pnpm build --no-lint 2>&1 | head -5
```

Expected: no errors related to missing modules.

**Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml components/ui/slider.tsx
git commit -m "chore: add react-easy-crop and shadcn slider"
```

---

### Task 3: Add Storage Helpers for Profile Images

**Files:**
- Modify: `lib/supabase/storage.ts`

**Step 1: Add uploadProfileImage and deleteProfileImage to `lib/supabase/storage.ts`**

Add after the existing `deleteEventCover` function:

```typescript
export async function uploadProfileImage(userId: string, blob: Blob): Promise<string> {
  const fileName = `${userId}.webp`;

  const { error } = await supabase.storage
    .from('profile-images')
    .upload(fileName, blob, {
      contentType: 'image/webp',
      upsert: true,
    });

  if (error) throw new Error(`Upload failed: ${error.message}`);

  const { data } = supabase.storage
    .from('profile-images')
    .getPublicUrl(fileName);

  // Append cache-buster so the browser doesn't serve stale image
  return `${data.publicUrl}?t=${Date.now()}`;
}

export async function deleteProfileImage(userId: string): Promise<void> {
  await supabase.storage.from('profile-images').remove([`${userId}.webp`]);
}
```

Key details:
- `upsert: true` overwrites existing file (one file per user)
- Cache-buster query param forces browser to re-fetch after re-upload
- File naming: `{userId}.webp` — deterministic, no orphans

**Step 2: Verify the file has no TypeScript errors**

```bash
pnpm exec tsc --noEmit --pretty 2>&1 | grep storage
```

Expected: no errors.

**Step 3: Commit**

```bash
git add lib/supabase/storage.ts
git commit -m "feat: add profile image upload/delete storage helpers"
```

---

### Task 4: Add Server Actions for Profile Image

**Files:**
- Modify: `app/actions/profile.ts`
- Modify: `lib/validations/profile.ts`

**Step 1: Add URL validation schema to `lib/validations/profile.ts`**

Add after the existing `updateProfileSchema`:

```typescript
export const updateProfileImageSchema = z.object({
  imageUrl: z.string().url(),
});
```

**Step 2: Add server actions to `app/actions/profile.ts`**

Add these two functions after the existing `updateProfile`:

```typescript
import { updateProfileImageSchema } from '@/lib/validations/profile';

export async function updateProfileImage(imageUrl: string) {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');

  updateProfileImageSchema.parse({ imageUrl });

  await updateUserProfile(session.user.id, { image: imageUrl });

  revalidatePath('/user/settings');
  revalidatePath('/user/directory');
}

export async function removeProfileImage() {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');

  // Reset to null — NextAuth will fall back to Google profile image on next sign-in,
  // but for now show the fallback avatar
  await updateUserProfile(session.user.id, { image: null });

  revalidatePath('/user/settings');
  revalidatePath('/user/directory');
}
```

**Step 3: Update `updateUserProfile` in `lib/db/event-queries.ts` to accept `image`**

The function at line 466 currently accepts specific fields. Add `image` to the type:

```typescript
export async function updateUserProfile(userId: string, data: {
  major?: string | null;
  classYear?: string | null;
  phone?: string | null;
  interests?: string | null;
  bio?: string | null;
  location?: string | null;
  semesterStatus?: string | null;
  image?: string | null;
}) {
```

**Step 4: Verify no TypeScript errors**

```bash
pnpm exec tsc --noEmit --pretty 2>&1 | grep -E '(profile|event-queries)' | head -10
```

Expected: no errors.

**Step 5: Commit**

```bash
git add app/actions/profile.ts lib/validations/profile.ts lib/db/event-queries.ts
git commit -m "feat: add server actions for profile image update/remove"
```

---

### Task 5: Build the Profile Image Editor Component

**Files:**
- Create: `components/user/profile-image-editor.tsx`

This is the main component — avatar display, file picker, crop modal, upload logic.

**Step 1: Create `components/user/profile-image-editor.tsx`**

```tsx
'use client';

import { useState, useCallback, useRef } from 'react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { uploadProfileImage, deleteProfileImage } from '@/lib/supabase/storage';
import { updateProfileImage, removeProfileImage } from '@/app/actions/profile';
import { toast } from 'sonner';
import { Camera, Trash2 } from 'lucide-react';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const OUTPUT_SIZE = 256;

interface ProfileImageEditorProps {
  userId: string;
  currentImage: string | null;
  userName: string | null;
}

export function ProfileImageEditor({ userId, currentImage, userName }: ProfileImageEditorProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      toast.error('Image must be under 5 MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setImageSrc(reader.result as string);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setIsOpen(true);
    };
    reader.readAsDataURL(file);

    // Reset input so the same file can be re-selected
    e.target.value = '';
  };

  const getCroppedBlob = async (): Promise<Blob> => {
    if (!imageSrc || !croppedAreaPixels) throw new Error('No crop data');

    const image = new Image();
    image.src = imageSrc;
    await new Promise((resolve) => { image.onload = resolve; });

    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext('2d')!;

    ctx.drawImage(
      image,
      croppedAreaPixels.x,
      croppedAreaPixels.y,
      croppedAreaPixels.width,
      croppedAreaPixels.height,
      0,
      0,
      OUTPUT_SIZE,
      OUTPUT_SIZE,
    );

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Canvas export failed'))),
        'image/webp',
        0.8,
      );
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const blob = await getCroppedBlob();
      const url = await uploadProfileImage(userId, blob);
      await updateProfileImage(url);
      toast.success('Profile photo updated');
      setIsOpen(false);
    } catch {
      toast.error('Failed to update profile photo');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async () => {
    setIsRemoving(true);
    try {
      await deleteProfileImage(userId);
      await removeProfileImage();
      toast.success('Profile photo removed');
    } catch {
      toast.error('Failed to remove profile photo');
    } finally {
      setIsRemoving(false);
    }
  };

  const initials = userName
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';

  return (
    <div className="flex items-center gap-4">
      <Avatar className="size-20">
        <AvatarImage src={currentImage || undefined} />
        <AvatarFallback className="text-lg">{initials}</AvatarFallback>
      </Avatar>

      <div className="flex flex-col gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileSelect}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
        >
          <Camera className="mr-2 size-4" />
          Change Photo
        </Button>
        {currentImage && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleRemove}
            disabled={isRemoving}
            className="text-muted-foreground"
          >
            <Trash2 className="mr-2 size-4" />
            {isRemoving ? 'Removing...' : 'Remove'}
          </Button>
        )}
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Crop Profile Photo</DialogTitle>
          </DialogHeader>

          <div className="relative h-64 w-full">
            {imageSrc && (
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            )}
          </div>

          <div className="flex items-center gap-3 px-1">
            <span className="text-muted-foreground text-sm">Zoom</span>
            <Slider
              value={[zoom]}
              onValueChange={([v]) => setZoom(v)}
              min={1}
              max={3}
              step={0.1}
              className="flex-1"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

Key details:
- `react-easy-crop` handles drag/zoom/circular crop zone
- `getCroppedBlob()` uses canvas to produce 256x256 WebP at 80% quality
- File size validated before opening modal (< 5 MB)
- `accept="image/*"` covers JPEG, PNG, WebP, HEIC
- Hidden `<input type="file">` triggered by the button
- Dialog uses existing shadcn components
- Remove button only shown when user has a custom image

**Step 2: Verify no TypeScript errors**

```bash
pnpm exec tsc --noEmit --pretty 2>&1 | grep profile-image | head -10
```

Expected: no errors.

**Step 3: Commit**

```bash
git add components/user/profile-image-editor.tsx
git commit -m "feat: add profile image editor with crop modal"
```

---

### Task 6: Integrate Editor into Profile Form

**Files:**
- Modify: `components/user/profile-form.tsx`

**Step 1: Add the ProfileImageEditor to the form**

In `components/user/profile-form.tsx`, add the import and render the editor above the form fields:

```tsx
import { ProfileImageEditor } from '@/components/user/profile-image-editor';
```

Update the component props to accept `userId`:

```tsx
export function ProfileForm({ user }: { user: User }) {
```

Add the editor as the first child inside the `<form>`:

```tsx
<form action={handleSubmit} className="space-y-6">
  <ProfileImageEditor
    userId={user.id}
    currentImage={user.image}
    userName={user.name}
  />

  <div className="grid gap-4 sm:grid-cols-2">
    {/* existing fields */}
```

The `User` type already includes `id`, `image`, and `name` since it's `$inferSelect` from the schema.

**Step 2: Verify the page renders**

```bash
pnpm dev &
sleep 3
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/user/settings
kill %1
```

Expected: 200 (or 307 redirect to login, which is fine for unauthenticated).

**Step 3: Commit**

```bash
git add components/user/profile-form.tsx
git commit -m "feat: integrate profile image editor into settings page"
```

---

### Task 7: Manual Testing & Polish

**Step 1: Run the dev server and test the full flow**

```bash
pnpm dev
```

Test checklist:
- [ ] Navigate to `/user/settings`
- [ ] See current avatar (from Google) with "Change Photo" button
- [ ] Click "Change Photo" → file picker opens
- [ ] Select a large image (> 5 MB) → error toast
- [ ] Select a valid image → crop modal opens
- [ ] Drag to reposition, use zoom slider
- [ ] Click "Save" → avatar updates, toast shown
- [ ] Refresh page → new image persists
- [ ] Click "Remove" → avatar resets to initials fallback
- [ ] Check other pages (directory, event detail) → avatar shows updated image

**Step 2: Run build to verify no issues**

```bash
pnpm build
```

Expected: successful build with no errors.

**Step 3: Final commit if any polish needed**

```bash
git add -A
git commit -m "feat: profile image upload with circular crop"
```
