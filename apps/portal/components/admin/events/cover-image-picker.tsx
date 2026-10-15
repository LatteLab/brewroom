'use client';

import { useState, useEffect, useRef } from 'react';
import { Shuffle, Camera, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  generateGradientConfig,
  gradientConfigToCSS,
  serializeGradient,
  parseGradient,
  isGradient,
} from '@/lib/gradients';
import { uploadEventCover } from '@/lib/supabase/storage';

interface CoverImagePickerProps {
  value: string | null;
  onChange: (value: string) => void;
  compact?: boolean;
}

export function CoverImagePicker({ value, onChange, compact }: CoverImagePickerProps) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!value && !initializedRef.current) {
      initializedRef.current = true;
      const config = generateGradientConfig();
      onChange(serializeGradient(config));
    }
  }, [value, onChange]);

  function handleShuffle() {
    const config = generateGradientConfig();
    onChange(serializeGradient(config));
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      const url = await uploadEventCover(file);
      onChange(url);
    } catch (err) {
      console.error('Failed to upload cover image:', err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  const gradientConfig = value && isGradient(value) ? parseGradient(value) : null;
  const gradientCSS = gradientConfig ? gradientConfigToCSS(gradientConfig) : undefined;
  const isImage = value && !isGradient(value);

  return (
    <div className="space-y-1.5">
    <div
      className={cn(
        'relative rounded-2xl overflow-hidden bg-muted',
        compact ? 'aspect-[2/1]' : 'aspect-[4/3] md:aspect-square'
      )}
    >
      {gradientCSS && (
        <div className="absolute inset-0" style={{ background: gradientCSS }} />
      )}

      {isImage && (
        <img
          src={value}
          alt="Event cover"
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}

      {uploading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <Loader2 className="h-8 w-8 animate-spin text-white" />
        </div>
      )}

      {/* Shuffle button — bottom-left */}
      <button
        type="button"
        onClick={handleShuffle}
        className={cn(
          'absolute bottom-3 left-3 flex h-10 w-10 items-center justify-center',
          'rounded-full bg-black/50 text-white transition-colors hover:bg-black/70'
        )}
        title="Shuffle gradient"
      >
        <Shuffle className="h-4 w-4" />
      </button>

      {/* Upload button — bottom-right */}
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center',
          'rounded-full bg-black/50 text-white transition-colors hover:bg-black/70'
        )}
        title="Upload image"
      >
        <Camera className="h-4 w-4" />
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
    <p className="text-xs text-muted-foreground">Ideal aspect ratio is 1:1 (square)</p>
    </div>
  );
}
