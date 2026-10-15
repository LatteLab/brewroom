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
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('Failed to load image'));
    });

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
      // Clean up old custom image from storage (ignore errors — orphan is harmless)
      if (currentImage?.includes('/profile-images/')) {
        deleteProfileImage(currentImage).catch(() => {});
      }
      toast.success('Profile photo updated');
      setIsOpen(false);
    } catch {
      toast.error('Failed to update profile photo');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!currentImage) return;
    setIsRemoving(true);
    try {
      await removeProfileImage();
      await deleteProfileImage(currentImage);
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
