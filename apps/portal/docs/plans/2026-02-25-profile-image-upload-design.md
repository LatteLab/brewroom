# Profile Image Upload with Circular Crop

## Overview

Add a profile image uploader to the user settings page. Users pick a photo, crop/reposition it in a modal with a circular crop zone, and save a 256x256 cropped result to a new `profile-images` Supabase Storage bucket. The existing `users.image` column stores the URL.

## Upload Constraints

- **Max file size:** 5 MB (validated client-side before opening crop modal)
- **Accepted formats:** JPEG, PNG, WebP, HEIC
- **Output:** 256x256 px WebP at 80% quality (~15-30 KB final)

## UX Flow

1. Settings page shows current avatar (Google photo or custom upload) with a **"Change Photo"** button and a **"Remove"** option (resets to Google default)
2. "Change Photo" opens native file picker (`accept="image/*"`)
3. After file selection: validate size (< 5 MB), then open crop modal
4. **Crop modal** (shadcn Dialog):
   - `react-easy-crop` with `cropShape="round"`, aspect ratio 1:1
   - Zoom slider beneath the crop area
   - Cancel / Save buttons
5. On "Save":
   - Canvas crops the image to 256x256 WebP blob
   - Upload blob to `profile-images` bucket via Supabase Storage
   - Delete old custom image if one exists
   - Call server action to update `users.image` with new public URL
   - Close modal, show success toast

## Storage

- **New Supabase bucket:** `profile-images` (public)
- **RLS policies:** Allow `anon` role for upload/delete (matches existing `event-covers` pattern)
- **File naming:** `{userId}.webp` — one file per user, overwritten on re-upload (no orphan cleanup needed)

## Library

- **`react-easy-crop`** — circular crop, zoom, drag-to-reposition out of the box (~8 KB gzipped)
- Canvas API to produce the final cropped WebP blob

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `lib/supabase/storage.ts` | Modify | Add `uploadProfileImage()` / `deleteProfileImage()` helpers |
| `components/user/profile-image-editor.tsx` | Create | Client component: avatar display + change button + crop modal |
| `components/user/profile-form.tsx` | Modify | Add image editor above existing form fields |
| `app/actions/profile.ts` | Modify | Add `updateProfileImage(url)` / `removeProfileImage()` server actions |
| `lib/validations/profile.ts` | Modify | Add URL validation for image update |

## What Stays the Same

- All 13+ `AvatarImage` consumers already read `user.image` — no changes needed
- Database schema unchanged (`users.image` is already a text column)
- Google OAuth still sets the initial image; custom upload overwrites it

## Decisions

- **Client-side crop:** Image is cropped in-browser via canvas before upload. Only the final 256x256 WebP is stored.
- **Modal UX:** Crop editor opens in a shadcn Dialog, similar to LinkedIn/Discord profile editors.
- **Single file per user:** Using `{userId}.webp` as filename means re-uploads overwrite the old file automatically.
