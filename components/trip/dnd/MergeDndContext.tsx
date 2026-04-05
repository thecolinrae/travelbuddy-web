'use client';

import { createContext, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { GitMerge } from 'lucide-react';
import { MergeActivityModal } from '@/components/trip/day/MergeActivityModal';
import type { Activity, ActivityEvent } from '@/types';

// ─── Context ──────────────────────────────────────────────────────────────────
// (currently unused externally — kept for future enhancements)

const MergeDndCtx = createContext<Record<string, never>>({});

// ─── Provider ─────────────────────────────────────────────────────────────────

interface Props {
  tripId: string;
  activities: Activity[];
  activityEvents: ActivityEvent[];
  isOwner: boolean;
  children: React.ReactNode;
}

export function MergeDndContext({ tripId, activities, activityEvents, children }: Props) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [pendingMerge, setPendingMerge] = useState<{
    activity: Activity;
    event: ActivityEvent;
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  function getDraggingLabel(): string {
    if (!draggingId) return '';
    if (draggingId.startsWith('activity:')) {
      const id = draggingId.slice('activity:'.length);
      return activities.find((a) => a.id === id)?.name ?? '';
    }
    const id = draggingId.slice('event:'.length);
    return activityEvents.find((e) => e.id === id)?.description ?? '';
  }

  function onDragStart(event: DragStartEvent) {
    setDraggingId(String(event.active.id));
  }

  function onDragEnd(event: DragEndEvent) {
    setDraggingId(null);
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    if (!overId || activeId === overId) return;

    const activeIsActivity = activeId.startsWith('activity:');
    const overIsActivity = overId.startsWith('activity:');

    // Only allow Activity ↔ ActivityEvent drops
    if (activeIsActivity === overIsActivity) return;

    const activityId = activeIsActivity
      ? activeId.slice('activity:'.length)
      : overId.slice('activity:'.length);
    const eventId = activeIsActivity
      ? overId.slice('event:'.length)
      : activeId.slice('event:'.length);

    const activity = activities.find((a) => a.id === activityId);
    const actEvent = activityEvents.find((e) => e.id === eventId);

    if (!activity || !actEvent) return;
    if (activity.linkedEventId || actEvent.linkedActivityId) return;

    setPendingMerge({ activity, event: actEvent });
  }

  return (
    <MergeDndCtx.Provider value={{}}>
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        {children}

        <DragOverlay dropAnimation={null}>
          {draggingId && (
            <div className="rounded-xl border bg-card shadow-lg px-4 py-2.5 flex items-center gap-2 opacity-95 pointer-events-none">
              <GitMerge className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm font-medium truncate max-w-[16rem]">{getDraggingLabel()}</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {pendingMerge && (
        <MergeActivityModal
          open={!!pendingMerge}
          onOpenChange={(o) => { if (!o) setPendingMerge(null); }}
          tripId={tripId}
          activity={pendingMerge.activity}
          event={pendingMerge.event}
          onMerged={() => setPendingMerge(null)}
        />
      )}
    </MergeDndCtx.Provider>
  );
}
