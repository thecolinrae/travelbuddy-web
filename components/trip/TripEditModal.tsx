'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Check, ImageOff, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

interface Props {
  tripId: string;
  open: boolean;
  onClose: () => void;
  initial: {
    name: string;
    coverEmoji: string;
    coverPhotoUrl: string | null;
    destination: string;
    startDate: string | null;
    endDate: string | null;
  };
}

// Sentinel value meaning "no photo" (clear the current one)
const NO_PHOTO = '__none__';

export function TripEditModal({ tripId, open, onClose, initial }: Props) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [coverEmoji, setCoverEmoji] = useState(initial.coverEmoji);
  const [destination, setDestination] = useState(initial.destination);
  const [startDate, setStartDate] = useState(initial.startDate ?? '');
  const [endDate, setEndDate] = useState(initial.endDate ?? '');
  const [saving, setSaving] = useState(false);

  // Photo picker state
  const [selectedPhoto, setSelectedPhoto] = useState<string>(
    initial.coverPhotoUrl ?? NO_PHOTO,
  );
  const [photoOptions, setPhotoOptions] = useState<string[]>([]);
  const [photosLoading, setPhotosLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPhotosLoading(true);
    fetch(`/api/trips/${tripId}/photos`)
      .then((r) => r.json())
      .then((data: { photos?: string[] }) => {
        setPhotoOptions(data.photos ?? []);
      })
      .catch(() => { /* non-fatal */ })
      .finally(() => setPhotosLoading(false));
  }, [open, tripId]);

  async function handleSave() {
    setSaving(true);
    try {
      await fetch(`/api/trips/${tripId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          coverEmoji: coverEmoji.trim() || '✈️',
          coverPhotoUrl: selectedPhoto === NO_PHOTO ? null : selectedPhoto,
          destination: destination.trim(),
          startDate: startDate || null,
          endDate: endDate || null,
        }),
      });
      router.refresh();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  // All selectable options: "none" + any current photo not in the fetched list + fetched options
  const allOptions: string[] = [];
  if (
    initial.coverPhotoUrl &&
    initial.coverPhotoUrl !== NO_PHOTO &&
    !photoOptions.includes(initial.coverPhotoUrl)
  ) {
    allOptions.push(initial.coverPhotoUrl);
  }
  allOptions.push(...photoOptions);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit trip</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name + emoji row */}
          <div className="flex gap-3">
            <div className="space-y-1.5 w-16">
              <Label htmlFor="emoji">Emoji</Label>
              <Input
                id="emoji"
                value={coverEmoji}
                onChange={(e) => setCoverEmoji(e.target.value)}
                className="text-center text-xl"
                maxLength={4}
              />
            </div>
            <div className="space-y-1.5 flex-1">
              <Label htmlFor="trip-name">Trip name</Label>
              <Input
                id="trip-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. London & Paris"
              />
            </div>
          </div>

          {/* Destination */}
          <div className="space-y-1.5">
            <Label htmlFor="destination">Destination</Label>
            <Input
              id="destination"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="e.g. London"
            />
          </div>

          {/* Date range */}
          <div className="flex gap-3">
            <div className="space-y-1.5 flex-1">
              <Label htmlFor="start-date">Start date</Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 flex-1">
              <Label htmlFor="end-date">End date</Label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          {/* Cover photo picker */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Cover photo</Label>
              {photosLoading && (
                <RefreshCw className="h-3.5 w-3.5 text-text-muted animate-spin" />
              )}
            </div>

            <div className="grid grid-cols-4 gap-2">
              {/* "No photo" tile */}
              <button
                type="button"
                onClick={() => setSelectedPhoto(NO_PHOTO)}
                className={[
                  'relative aspect-video rounded-lg border-2 bg-surface flex items-center justify-center transition-all overflow-hidden',
                  selectedPhoto === NO_PHOTO
                    ? 'border-primary ring-2 ring-primary/30'
                    : 'border-border hover:border-text-muted',
                ].join(' ')}
                aria-label="No cover photo"
              >
                <ImageOff className="h-4 w-4 text-text-muted" />
                {selectedPhoto === NO_PHOTO && (
                  <div className="absolute top-1 right-1 bg-primary rounded-full p-0.5">
                    <Check className="h-2.5 w-2.5 text-primary-foreground" />
                  </div>
                )}
              </button>

              {/* Photo option tiles */}
              {photosLoading && allOptions.length === 0
                ? Array.from({ length: 3 }).map((_, i) => (
                    <div
                      key={i}
                      className="aspect-video rounded-lg border border-border bg-surface animate-pulse"
                    />
                  ))
                : allOptions.map((url) => (
                    <button
                      key={url}
                      type="button"
                      onClick={() => setSelectedPhoto(url)}
                      className={[
                        'relative aspect-video rounded-lg border-2 overflow-hidden transition-all',
                        selectedPhoto === url
                          ? 'border-primary ring-2 ring-primary/30'
                          : 'border-transparent hover:border-text-muted',
                      ].join(' ')}
                      aria-label="Select this photo"
                    >
                      <Image
                        src={url}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="96px"
                      />
                      {selectedPhoto === url && (
                        <div className="absolute inset-0 bg-black/10" />
                      )}
                      {selectedPhoto === url && (
                        <div className="absolute top-1 right-1 bg-primary rounded-full p-0.5">
                          <Check className="h-2.5 w-2.5 text-primary-foreground" />
                        </div>
                      )}
                    </button>
                  ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
