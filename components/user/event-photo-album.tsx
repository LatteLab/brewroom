'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Images, X } from 'lucide-react';
import { Dialog, DialogOverlay, DialogPortal, DialogTitle } from '@/components/ui/dialog';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import type { EventPhoto } from '@/lib/db/schema';

interface EventPhotoAlbumProps {
  photos: EventPhoto[];
}

function photoAlt(photo: EventPhoto, index: number) {
  return photo.caption || `Event photo ${index + 1}`;
}

export function EventPhotoAlbum({ photos }: EventPhotoAlbumProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const activePhoto = photos[activeIndex];
  const hasMultiple = photos.length > 1;

  function showPhoto(index: number) {
    setActiveIndex(index);
    setOpen(true);
  }

  const showPrevious = useCallback(() => {
    setActiveIndex((current) => (current - 1 + photos.length) % photos.length);
  }, [photos.length]);

  const showNext = useCallback(() => {
    setActiveIndex((current) => (current + 1) % photos.length);
  }, [photos.length]);

  useEffect(() => {
    if (!open || photos.length === 0) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'ArrowLeft') showPrevious();
      if (event.key === 'ArrowRight') showNext();
      if (event.key === 'Escape') setOpen(false);
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, photos.length, showNext, showPrevious]);

  if (photos.length === 0) return null;

  return (
    <>
      <section className="flex flex-col gap-4 border-t pt-6">
        <div className="flex items-center gap-2">
          <Images className="size-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Photos</h2>
          <span className="text-sm text-muted-foreground">
            {photos.length}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {photos.map((photo, index) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => showPhoto(index)}
              className="group relative aspect-square overflow-hidden rounded-xl bg-muted text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label={`View ${photoAlt(photo, index)}`}
            >
              <img
                src={photo.publicUrl}
                alt={photoAlt(photo, index)}
                className="size-full object-cover transition-transform duration-200 group-hover:scale-105"
              />
              {photo.caption && (
                <div className="absolute inset-x-0 bottom-0 bg-black/55 p-2 text-xs font-medium text-white">
                  <span className="line-clamp-2">{photo.caption}</span>
                </div>
              )}
            </button>
          ))}
        </div>
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPortal>
          <DialogOverlay className="bg-black/85" />
          <DialogPrimitive.Content
            className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 p-4"
            onClick={(event) => {
              if (event.target === event.currentTarget) setOpen(false);
            }}
          >
            <DialogTitle className="sr-only">
              {activePhoto ? photoAlt(activePhoto, activeIndex) : 'Event photo'}
            </DialogTitle>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-4 top-4 rounded-full bg-black/40 p-2 text-white/80 backdrop-blur-sm transition-colors hover:bg-black/60 hover:text-white"
              aria-label="Close"
            >
              <X className="size-5" />
            </button>

            {hasMultiple && (
              <>
                <button
                  type="button"
                  onClick={showPrevious}
                  className="absolute left-3 top-1/2 rounded-full bg-black/40 p-2 text-white/80 backdrop-blur-sm transition-colors hover:bg-black/60 hover:text-white sm:left-6"
                  aria-label="Previous photo"
                >
                  <ChevronLeft className="size-6" />
                </button>
                <button
                  type="button"
                  onClick={showNext}
                  className="absolute right-3 top-1/2 rounded-full bg-black/40 p-2 text-white/80 backdrop-blur-sm transition-colors hover:bg-black/60 hover:text-white sm:right-6"
                  aria-label="Next photo"
                >
                  <ChevronRight className="size-6" />
                </button>
              </>
            )}

            {activePhoto && (
              <figure className="flex max-h-[88vh] max-w-[92vw] flex-col items-center gap-3">
                <img
                  src={activePhoto.publicUrl}
                  alt={photoAlt(activePhoto, activeIndex)}
                  className="max-h-[78vh] max-w-full rounded-lg object-contain"
                />
                {(activePhoto.caption || hasMultiple) && (
                  <figcaption className="max-w-2xl text-center text-sm text-white/90">
                    {activePhoto.caption && <span>{activePhoto.caption}</span>}
                    {hasMultiple && (
                      <span className="block text-xs text-white/60">
                        {activeIndex + 1} of {photos.length}
                      </span>
                    )}
                  </figcaption>
                )}
              </figure>
            )}
          </DialogPrimitive.Content>
        </DialogPortal>
      </Dialog>
    </>
  );
}
