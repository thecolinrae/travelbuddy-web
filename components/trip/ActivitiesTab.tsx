'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Sparkles, Compass } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { QuickAddBar } from './activities/QuickAddBar';
import { ActivityGroupSection } from './activities/ActivityGroupSection';
import { ScheduleSheet } from './activities/ScheduleSheet';
import {
  groupByCity,
  groupByType,
  sortByDate,
  type SortMode,
} from './activities/activityUtils';
import type { Activity, ActivityType, TimelineEvent } from '@/types';

// ─── Edit modal (preserved from previous implementation) ─────────────────────

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

// ─── Main tab ─────────────────────────────────────────────────────────────────

interface Props {
  tripId: string;
  destination: string;
  destinations: string[];
  activities: Activity[];
  timeline: TimelineEvent[];
  tripStartDate: string | null;
  tripEndDate: string | null;
  isOwner: boolean;
}

const SORT_OPTIONS: { id: SortMode; label: string }[] = [
  { id: 'city', label: 'City' },
  { id: 'type', label: 'Type' },
  { id: 'date', label: 'Date' },
];

export function ActivitiesTab({
  tripId,
  destination,
  destinations,
  activities,
  timeline,
  tripStartDate,
  tripEndDate,
  isOwner,
}: Props) {
  const router = useRouter();
  const [sortMode, setSortMode] = useState<SortMode>('city');
  const [refreshing, setRefreshing] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [schedulingActivity, setSchedulingActivity] = useState<Activity | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const saved = activities.filter((a) => a.saved);

  const groups =
    sortMode === 'city'
      ? groupByCity(saved)
      : sortMode === 'type'
      ? groupByType(saved)
      : sortByDate(saved);

  // ── Persistence ─────────────────────────────────────────────────────────────

  async function persistActivities(updated: Activity[]) {
    await fetch(`/api/trips/${tripId}/activities`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activities: updated, destination }),
    });
    router.refresh();
  }

  // ── Handlers ─────────────────────────────────────────────────────────────────

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

  async function handleEdit(updated: Activity) {
    const newList = activities.map((a) => (a.id === updated.id ? updated : a));
    await persistActivities(newList);
    setEditingActivity(null);
  }

  async function handleDelete(id: string) {
    await persistActivities(activities.filter((a) => a.id !== id));
    setConfirmDelete(null);
  }

  async function handleAdd(activity: Activity) {
    await persistActivities([...activities, activity]);
  }

  async function handleSchedule(activityId: string, date: string, time: string) {
    const newList = activities.map((a) =>
      a.id === activityId
        ? { ...a, scheduledDate: date, scheduledTime: time || undefined }
        : a,
    );
    await persistActivities(newList);
    setSchedulingActivity(null);
  }

  async function handleClearSchedule(activityId: string) {
    const newList = activities.map((a) =>
      a.id === activityId
        ? { ...a, scheduledDate: undefined, scheduledTime: undefined }
        : a,
    );
    await persistActivities(newList);
    setSchedulingActivity(null);
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Quick-add bar (owner only) */}
      {isOwner && (
        <QuickAddBar
          tripId={tripId}
          destinations={destinations.length > 0 ? destinations : [destination]}
          onAdd={handleAdd}
        />
      )}

      {/* Toolbar: sort controls + refresh */}
      <div className="flex items-center gap-3">
        {/* Sort segmented control */}
        <div className="flex rounded-lg border border-border overflow-hidden text-sm">
          {SORT_OPTIONS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setSortMode(id)}
              className={cn(
                'px-3 py-1.5 font-medium transition-colors',
                sortMode === id
                  ? 'bg-primary/10 text-text-base border-r border-border last:border-r-0'
                  : 'text-text-muted hover:bg-surface hover:text-text-base border-r border-border last:border-r-0',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {isOwner && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="gap-1.5 ml-auto"
          >
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {refreshing ? 'Generating…' : 'Refresh'}
          </Button>
        )}
      </div>

      {/* Empty state */}
      {saved.length === 0 && (
        <div className="py-16 flex flex-col items-center gap-4 text-center">
          <div className="rounded-full bg-surface p-4">
            <Compass className="h-8 w-8 text-text-muted" />
          </div>
          <div className="space-y-1">
            <p className="font-semibold text-text-base">No activities yet</p>
            <p className="type-caption max-w-xs">
              Recommendations are generated automatically after import.
              {isOwner && ' Or use the bar above to add one now.'}
            </p>
          </div>
        </div>
      )}

      {/* Grouped activity list */}
      {groups.length > 0 && (
        <div className="space-y-8">
          {groups.map((group) => (
            <ActivityGroupSection
              key={group.label || '__all__'}
              label={group.label}
              activities={group.items}
              isOwner={isOwner}
              onEdit={setEditingActivity}
              onSchedule={setSchedulingActivity}
              confirmDelete={confirmDelete}
              onDeleteRequest={setConfirmDelete}
              onConfirmDelete={handleDelete}
              onCancelDelete={() => setConfirmDelete(null)}
            />
          ))}
        </div>
      )}

      {/* Edit modal */}
      {editingActivity && (
        <ActivityEditModal
          activity={editingActivity}
          onSave={handleEdit}
          onClose={() => setEditingActivity(null)}
        />
      )}

      {/* Schedule sheet */}
      <ScheduleSheet
        activity={schedulingActivity}
        timeline={timeline}
        activities={activities}
        tripStartDate={tripStartDate}
        tripEndDate={tripEndDate}
        onSchedule={handleSchedule}
        onClear={handleClearSchedule}
        onClose={() => setSchedulingActivity(null)}
      />
    </div>
  );
}
