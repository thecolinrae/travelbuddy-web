'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Sparkles, Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { QuickAddBar } from './activities/QuickAddBar';
import { ActivityGroupSection } from './activities/ActivityGroupSection';
import { ScheduleSheet } from './activities/ScheduleSheet';
import { ActivityEditModal } from './activities/ActivityEditModal';
import {
  groupByCity,
  groupByType,
  sortByDate,
  type SortMode,
} from './activities/activityUtils';
import type { Activity, TimelineEvent } from '@/types';

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
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
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

  // Reset collapse state whenever the sort mode changes
  useEffect(() => { setCollapsedGroups(new Set()); }, [sortMode]);

  const collapsibleGroups = groups.filter((g) => !!g.label);
  const allCollapsed = collapsibleGroups.length > 0 && collapsibleGroups.every((g) => collapsedGroups.has(g.label));

  function toggleGroup(label: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  }

  function toggleAll() {
    if (allCollapsed) {
      setCollapsedGroups(new Set());
    } else {
      setCollapsedGroups(new Set(collapsibleGroups.map((g) => g.label)));
    }
  }

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
    const target = activities.find((a) => a.id === activityId);
    let enrichedFields: Partial<Activity> = {};

    if (target && !target.address) {
      try {
        const res = await fetch(`/api/trips/${tripId}/activities/enrich`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: target.name, city: target.city }),
        });
        if (res.ok) {
          const data = await res.json() as {
            description?: string; type?: string; estimatedCost?: string;
            duration?: string; bestTime?: string; tips?: string;
            familyFriendly?: boolean; highlights?: string[];
            locationAddress?: string; city?: string;
          };
          enrichedFields = {
            description: target.description || data.description,
            estimatedCost: target.estimatedCost ?? data.estimatedCost,
            duration: target.duration ?? data.duration,
            bestTime: target.bestTime ?? data.bestTime,
            tips: target.tips ?? data.tips,
            familyFriendly: target.familyFriendly ?? data.familyFriendly,
            highlights: target.highlights ?? data.highlights,
            address: data.locationAddress,
            city: target.city || data.city,
          };
        }
      } catch {
        // non-fatal — proceed without enrichment
      }
    }

    const newList = activities.map((a) =>
      a.id === activityId
        ? { ...a, ...enrichedFields, scheduledDate: date, scheduledTime: time || undefined }
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

        <div className="flex items-center gap-2 ml-auto">
          {collapsibleGroups.length > 1 && (
            <button
              onClick={toggleAll}
              className="text-xs text-text-muted hover:text-text-base transition-colors"
            >
              {allCollapsed ? 'Expand all' : 'Collapse all'}
            </button>
          )}
          {isOwner && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              className="gap-1.5"
            >
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {refreshing ? 'Generating…' : 'Refresh'}
            </Button>
          )}
        </div>
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
              isCollapsed={collapsedGroups.has(group.label)}
              onToggle={() => toggleGroup(group.label)}
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
