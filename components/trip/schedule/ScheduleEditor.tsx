'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { ScheduleHeader } from './ScheduleHeader';
import { ScheduleGrid } from './ScheduleGrid';
import { TimezonePickerDialog } from '@/components/trip/TimezonePickerDialog';
import { ScheduleUnscheduledTray } from './ScheduleUnscheduledTray';
import { useScheduleDrag } from './useScheduleDrag';
import { buildDateRange, getWeekStart, addDays, getPrimaryTimezone, getOtherTimezones } from './utils';
import type { ScheduleView } from './constants';
import type { TimelineEvent, Activity } from '@/types';

interface Props {
  tripId: string;
  tripName: string;
  initialDate: string;
  initialView: ScheduleView;
  timeline: TimelineEvent[];
  initialActivities: Activity[];
  returnDayIndex?: number;
}

export function ScheduleEditor({
  tripId,
  tripName,
  initialDate,
  initialView,
  timeline,
  initialActivities,
  returnDayIndex,
}: Props) {
  const router = useRouter();
  const [view, setView] = useState<ScheduleView>(initialView);
  const [centerDate, setCenterDate] = useState(initialDate);
  const [activities, setActivities] = useState<Activity[]>(initialActivities);
  const [tzOverride, setTzOverride] = useState<string | null>(null);
  const [tzPickerOpen, setTzPickerOpen] = useState(false);

  const columnWidthRef = useRef<number>(0);

  // Compute visible dates
  const dates = (() => {
    if (view === 'day') return [centerDate];
    if (view === '3day') return buildDateRange(addDays(centerDate, -1), 3);
    // week: Monday-based
    return buildDateRange(getWeekStart(centerDate), 7);
  })();

  // Timezone context for visible dates
  const autoTz = useMemo(() => getPrimaryTimezone(timeline, dates), [timeline, dates]);
  const primaryTz = tzOverride ?? autoTz;
  const otherTimezones = useMemo(
    () => getOtherTimezones(timeline, dates, primaryTz),
    [timeline, dates, primaryTz],
  );

  // Optimistic activity delete + server sync
  const handleActivityDelete = useCallback(
    async (id: string) => {
      setActivities((prev) => prev.filter((a) => a.id !== id));
      try {
        await fetch(`/api/trips/${tripId}/activities/${id}`, { method: 'DELETE' });
        router.refresh();
      } catch {
        setActivities(initialActivities);
      }
    },
    [tripId, initialActivities, router],
  );

  // Optimistic activity update + server sync
  const handleActivityUpdate = useCallback(
    async (id: string, patch: Partial<Activity>) => {
      // Optimistic
      setActivities((prev) =>
        prev.map((a) => (a.id === id ? { ...a, ...patch } : a)),
      );

      try {
        await fetch(`/api/trips/${tripId}/activities/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        router.refresh();
      } catch {
        // On failure, roll back
        setActivities(initialActivities);
      }
    },
    [tripId, initialActivities, router],
  );

  const {
    activeActivity,
    handleDragStart,
    handleDragEnd,
    handleResizeEnd,
    getActiveHeight,
  } = useScheduleDrag({
    activities,
    onActivityUpdate: handleActivityUpdate,
    columnWidth: columnWidthRef.current,
  });

  // Use restrictToVerticalAxis only in single-day view
  const modifiers = view === 'day' ? [restrictToVerticalAxis] : [];

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const unscheduledActivities = activities.filter(
    (a) => a.saved && !a.scheduledDate,
  );

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <ScheduleHeader
        tripId={tripId}
        tripName={tripName}
        centerDate={centerDate}
        view={view}
        onViewChange={setView}
        onCenterDateChange={setCenterDate}
        returnDayIndex={returnDayIndex}
      />

      <DndContext
        sensors={sensors}
        modifiers={modifiers}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <ScheduleGrid
          dates={dates}
          timeline={timeline}
          activities={activities}
          activeActivity={activeActivity}
          activeHeight={getActiveHeight()}
          columnWidthRef={columnWidthRef}
          primaryTz={primaryTz}
          otherTimezones={otherTimezones}
          isTzOverrideActive={tzOverride !== null}
          onTimezoneBadgeClick={() => setTzPickerOpen(true)}
          onResizeEnd={handleResizeEnd}
          onDelete={handleActivityDelete}
        />

        <ScheduleUnscheduledTray
          activities={unscheduledActivities}
          dates={dates}
          timeline={timeline}
          onDelete={handleActivityDelete}
        />
      </DndContext>

      <TimezonePickerDialog
        open={tzPickerOpen}
        onOpenChange={setTzPickerOpen}
        value={primaryTz}
        onSelect={(iana) => { setTzOverride(iana); setTzPickerOpen(false); }}
        onReset={tzOverride !== null ? () => { setTzOverride(null); setTzPickerOpen(false); } : undefined}
      />
    </div>
  );
}
