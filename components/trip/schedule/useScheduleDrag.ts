'use client';

import { useCallback, useState } from 'react';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { yToTime, timeToY, parseDurationToMinutes, minutesToHeight } from './utils';
import { PIXELS_PER_SNAP, GRID_START_MINUTE } from './constants';
import type { Activity } from '@/types';

interface DragOptions {
  activities: Activity[];
  onActivityUpdate: (id: string, patch: Partial<Activity>) => Promise<void>;
  columnWidth: number;
}

export function useScheduleDrag({ activities, onActivityUpdate, columnWidth }: DragOptions) {
  const [activeActivity, setActiveActivity] = useState<Activity | null>(null);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const id = String(event.active.id).replace('activity:', '');
      const activity = activities.find((a) => a.id === id);
      if (activity) setActiveActivity(activity);
    },
    [activities],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveActivity(null);

      const { active, over, delta } = event;
      if (!active) return;

      const id = String(active.id).replace('activity:', '');
      const activity = activities.find((a) => a.id === id);
      if (!activity) return;

      // Must be dropped on a column
      if (!over?.id) return;
      const overId = String(over.id);
      if (!overId.startsWith('col:')) return;
      const targetDate = overId.replace('col:', '');

      let newTime: string;

      if (activity.scheduledTime) {
        // Moving a scheduled activity — use vertical delta
        const originalTop = timeToY(activity.scheduledTime);
        const snappedDeltaY = Math.round(delta.y / PIXELS_PER_SNAP) * PIXELS_PER_SNAP;
        newTime = yToTime(originalTop + snappedDeltaY);
      } else {
        // Coming from the unscheduled tray — compute from drop position
        const translated = event.active.rect.current?.translated;
        if (translated && over.rect) {
          // Compute where the item landed relative to the column top
          const relativeY = translated.top - over.rect.top;
          // Clamp and convert to time (grid starts at GRID_START_MINUTE)
          const snappedY = Math.max(0, Math.round(relativeY / PIXELS_PER_SNAP) * PIXELS_PER_SNAP);
          newTime = yToTime(snappedY);
        } else {
          newTime = '09:00'; // safe fallback
        }
      }

      const patch: Partial<Activity> = {};
      if (newTime !== activity.scheduledTime) patch.scheduledTime = newTime;
      if (targetDate !== activity.scheduledDate) patch.scheduledDate = targetDate;

      if (Object.keys(patch).length > 0) {
        onActivityUpdate(id, patch);
      }
    },
    [activities, onActivityUpdate],
  );

  const handleResizeEnd = useCallback(
    (activityId: string, durationMinutes: number) => {
      onActivityUpdate(activityId, { durationMinutes });
    },
    [onActivityUpdate],
  );

  const getActiveHeight = useCallback(() => {
    if (!activeActivity) return 60;
    return minutesToHeight(
      activeActivity.durationMinutes ?? parseDurationToMinutes(activeActivity.duration),
    );
  }, [activeActivity]);

  return {
    activeActivity,
    handleDragStart,
    handleDragEnd,
    handleResizeEnd,
    getActiveHeight,
  };
}
