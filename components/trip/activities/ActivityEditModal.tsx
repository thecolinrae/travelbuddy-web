'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import type { Activity, ActivityType } from '@/types';

interface ActivityEditModalProps {
  activity: Activity;
  onSave: (updated: Activity) => void;
  onClose: () => void;
}

export function ActivityEditModal({ activity, onSave, onClose }: ActivityEditModalProps) {
  const [name, setName] = useState(activity.name);
  const [description, setDescription] = useState(activity.description ?? '');
  const [city, setCity] = useState(activity.city ?? '');
  const [address, setAddress] = useState(activity.address ?? '');
  const [scheduledDate, setScheduledDate] = useState(activity.scheduledDate ?? '');
  const [scheduledTime, setScheduledTime] = useState(activity.scheduledTime ?? '');
  const [type, setType] = useState<ActivityType>(activity.type);

  function handleSave() {
    onSave({
      ...activity,
      name: name.trim(),
      description: description.trim(),
      city: city.trim() || undefined,
      address: address.trim() || undefined,
      type,
      scheduledDate: scheduledDate || undefined,
      scheduledTime: scheduledTime || undefined,
    });
  }

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit activity</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="act-name">Name</Label>
            <Input id="act-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="act-type">Type</Label>
            <Select
              id="act-type"
              value={type}
              onChange={(e) => setType(e.target.value as ActivityType)}
            >
              {(['sightseeing', 'food', 'adventure', 'culture', 'shopping', 'nightlife', 'nature', 'wellness'] as ActivityType[]).map((v) => (
                <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="act-desc">Description</Label>
            <textarea
              id="act-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>
          <div className="flex gap-3">
            <div className="space-y-1.5 flex-1">
              <Label htmlFor="act-city">City</Label>
              <Input id="act-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Paris" />
            </div>
            <div className="space-y-1.5 flex-1">
              <Label htmlFor="act-addr">Address</Label>
              <Input id="act-addr" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Optional" />
            </div>
          </div>
          <div className="flex gap-3">
            <div className="space-y-1.5 flex-1">
              <Label htmlFor="act-date">Scheduled date</Label>
              <Input id="act-date" type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
            </div>
            <div className="space-y-1.5 flex-1">
              <Label htmlFor="act-time">Scheduled time</Label>
              <Input id="act-time" type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!name.trim()}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
