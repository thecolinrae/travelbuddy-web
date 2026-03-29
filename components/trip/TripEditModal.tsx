'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
    destination: string;
    startDate: string | null;
    endDate: string | null;
  };
}

export function TripEditModal({ tripId, open, onClose, initial }: Props) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [coverEmoji, setCoverEmoji] = useState(initial.coverEmoji);
  const [destination, setDestination] = useState(initial.destination);
  const [startDate, setStartDate] = useState(initial.startDate ?? '');
  const [endDate, setEndDate] = useState(initial.endDate ?? '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await fetch(`/api/trips/${tripId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          coverEmoji: coverEmoji.trim() || '✈️',
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

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit trip</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
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

          <div className="space-y-1.5">
            <Label htmlFor="destination">Destination</Label>
            <Input
              id="destination"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="e.g. London"
            />
          </div>

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
