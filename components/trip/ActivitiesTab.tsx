'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Trash2, Pencil, Sparkles, Clock, DollarSign, CalendarDays } from 'lucide-react';
import { TripIcon } from '@/components/TripIcon';
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
import type { Activity, ActivityType } from '@/types';


interface EditModalProps {
  activity: Activity;
  onSave: (updated: Activity) => void;
  onClose: () => void;
}

function ActivityEditModal({ activity, onSave, onClose }: EditModalProps) {
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
            <select
              id="act-type"
              value={type}
              onChange={(e) => setType(e.target.value as ActivityType)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {(['sightseeing', 'food', 'adventure', 'culture', 'shopping', 'nightlife', 'nature', 'wellness'] as ActivityType[]).map((v) => (
                <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>
              ))}
            </select>
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

interface Props {
  tripId: string;
  destination: string;
  activities: Activity[];
  isOwner: boolean;
}

export function ActivitiesTab({ tripId, destination, activities, isOwner }: Props) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const saved = activities.filter((a) => a.saved);

  // Fetch suggestions and immediately save them all, deduplicating by name.
  async function handleRefresh() {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/trips/${tripId}/activities/suggest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination }),
      });
      const data = (await res.json()) as { suggestions: Activity[] };
      const incoming = (data.suggestions ?? []).map((a) => ({
        ...a,
        city: a.city || destination,
        saved: true as const,
      }));
      const existingNames = new Set(activities.map((a) => a.name.toLowerCase()));
      const toAdd = incoming.filter((a) => !existingNames.has(a.name.toLowerCase()));
      if (toAdd.length > 0) {
        await persistActivities([...activities, ...toAdd]);
      }
    } finally {
      setRefreshing(false);
    }
  }

  async function persistActivities(updated: Activity[]) {
    await fetch(`/api/trips/${tripId}/activities`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activities: updated, destination }),
    });
    router.refresh();
  }

  async function handleEdit(updated: Activity) {
    const newList = activities.map((a) => (a.id === updated.id ? updated : a));
    await persistActivities(newList);
    setEditingActivity(null);
  }

  async function handleDelete(id: string) {
    await persistActivities(activities.filter((a) => a.id !== id));
    setConfirmDelete(null);
  }

  return (
    <div className="space-y-6">
      {isOwner && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="gap-1.5"
          >
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {refreshing ? 'Generating…' : 'Refresh recommendations'}
          </Button>
        </div>
      )}

      {/* Saved activities */}
      {saved.length === 0 && (
        <div className="py-12 text-center text-muted-foreground text-sm">
          No activities yet — recommendations are generated automatically after import.
          {isOwner && <p className="mt-2">Or click &ldquo;Refresh recommendations&rdquo; to generate now.</p>}
        </div>
      )}

      {saved.length > 0 && (
        <div className="space-y-3">
          <ul className="space-y-3">
            {saved.map((a) => (
              <li key={a.id} className="rounded-xl border bg-card p-4 space-y-1.5">
                <div className="flex items-start gap-2">
                  <TripIcon type="activity" size="md" className="mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm">{a.name}</p>
                    {a.city && <p className="text-xs text-muted-foreground">{a.city}</p>}
                  </div>
                  {isOwner && (
                    <div className="flex gap-1 shrink-0">
                      {confirmDelete === a.id ? (
                        <>
                          <Button variant="destructive" size="sm" onClick={() => handleDelete(a.id)}>
                            Delete
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingActivity(a)}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirmDelete(a.id)}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>
                {a.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{a.description}</p>
                )}
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {a.estimatedCost && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <DollarSign className="h-3 w-3" />{a.estimatedCost}
                    </span>
                  )}
                  {a.duration && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />{a.duration}
                    </span>
                  )}
                  {a.scheduledDate && (
                    <span className="flex items-center gap-1 text-xs text-primary-dark font-medium">
                      <CalendarDays className="h-3 w-3" />
                      {new Date(a.scheduledDate + 'T12:00:00').toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric',
                      })}
                      {a.scheduledTime ? ` at ${a.scheduledTime}` : ''}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {editingActivity && (
        <ActivityEditModal
          activity={editingActivity}
          onSave={handleEdit}
          onClose={() => setEditingActivity(null)}
        />
      )}
    </div>
  );
}
