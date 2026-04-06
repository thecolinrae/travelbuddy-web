'use client';

import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { ScheduleAnchorBlock } from './ScheduleAnchorBlock';
import { ScheduleEventBlock } from './ScheduleEventBlock';
import {
  timeToY,
  timeToMinutes,
  minutesToHeight,
  parseDurationToMinutes,
  resolveConflictColumns,
  eventToGridY,
  eventDateInTz,
  utcIsoToLocalTime,
  formatTime,
  today,
} from './utils';
import {
  PIXELS_PER_HOUR,
  GRID_START_HOUR,
  GRID_END_HOUR,
  GRID_HEIGHT,
  GRID_START_MINUTE,
} from './constants';
import type { TimelineEvent, Activity } from '@/types';

interface Props {
  date: string;
  timeline: TimelineEvent[];
  activities: Activity[];
  nowMinutes: number | null;
  primaryTz: string;
  onResizeEnd: (activityId: string, durationMinutes: number) => void;
  onDelete: (activityId: string) => void;
}

const HOURS = Array.from(
  { length: GRID_END_HOUR - GRID_START_HOUR },
  (_, i) => GRID_START_HOUR + i,
);

/** True if this is a transport/flight departure event. */
function isTransportDeparture(e: TimelineEvent): boolean {
  return (
    (e.type === 'flight' && e.subtype === 'departure') ||
    (e.type === 'otherTransportation' && e.subtype === 'departure')
  );
}

/** True if this is a transport/flight arrival event. */
function isTransportArrival(e: TimelineEvent): boolean {
  return (
    (e.type === 'flight' && e.subtype === 'arrival') ||
    (e.type === 'otherTransportation' && e.subtype === 'arrival')
  );
}

/**
 * Find the paired arrival event for a departure, matched by legId.
 * Falls back to matching by flightNo + same journeyId for legacy data without legId.
 */
function findArrival(departure: TimelineEvent, timeline: TimelineEvent[]): TimelineEvent | undefined {
  if (departure.legId) {
    return timeline.find(
      (e) => e.legId === departure.legId && isTransportArrival(e),
    );
  }
  // Legacy fallback: same journeyId + matching flight number
  if (departure.journeyId && departure.type === 'flight') {
    const dep = departure as { flightNo?: string };
    return timeline.find(
      (e) =>
        e.journeyId === departure.journeyId &&
        e.type === 'flight' &&
        e.subtype === 'arrival' &&
        (e as { flightNo?: string }).flightNo === dep.flightNo,
    );
  }
  return undefined;
}

/**
 * Pixel height for an anchor block.
 * Departure events span from departure to arrival (UTC-accurate when possible).
 * Everything else defaults to 30 min.
 */
function getAnchorHeight(
  event: TimelineEvent,
  timeline: TimelineEvent[],
  primaryTz: string,
): number {
  if (!isTransportDeparture(event)) return minutesToHeight(30);

  const arrival = findArrival(event, timeline);
  if (!arrival) return minutesToHeight(30);

  // Prefer UTC duration — chronologically accurate across timezone changes
  if (event.utcISO && arrival.utcISO) {
    const mins = Math.round(
      (new Date(arrival.utcISO).getTime() - new Date(event.utcISO).getTime()) / 60000,
    );
    if (mins > 0) return minutesToHeight(mins);
  }

  // Fallback: pixel difference from grid positions in primaryTz
  const depY = eventToGridY(event, primaryTz);
  const arrY = eventToGridY(arrival, primaryTz);
  if (depY !== null && arrY !== null && arrY > depY) return arrY - depY;

  return minutesToHeight(30);
}

/**
 * Arrival time label for departure blocks, expressed in primaryTz.
 * Returns undefined when no paired arrival exists.
 */
function getArrivalLabel(
  event: TimelineEvent,
  timeline: TimelineEvent[],
  primaryTz: string,
): string | undefined {
  if (!isTransportDeparture(event)) return undefined;

  const arrival = findArrival(event, timeline);
  if (!arrival) return undefined;

  const localTime = arrival.utcISO
    ? (utcIsoToLocalTime(arrival.utcISO, primaryTz) ?? arrival.time)
    : arrival.time;

  return localTime ? formatTime(localTime) : undefined;
}

export function ScheduleColumn({
  date,
  timeline,
  activities,
  nowMinutes,
  primaryTz,
  onResizeEnd,
  onDelete,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${date}` });

  const isToday = date === today();

  // Anchor events for this date:
  // - Hotels: both check_in and check_out rendered independently
  // - Flight/transport departures: rendered as full-span block; arrival is suppressed on same date
  // - Flight/transport arrivals: only shown when the paired departure falls on a different date
  //   (in primaryTz) — e.g. overnight flights where the departure is on the previous day
  // - Connections and activity-type events: shown as 30-min blocks
  //
  // Column placement uses eventDateInTz (UTC-aware) rather than event.date so that a
  // 19:55 EST departure correctly appears in the next day's column when primaryTz is CEST.
  const anchorEvents = timeline.filter((e) => {
    if (eventDateInTz(e, primaryTz) !== date || !e.time) return false;
    if (e.type === 'hotel' || e.type === 'activity') return true;
    if (isTransportDeparture(e)) return true;
    if (isTransportArrival(e)) {
      // Show arrival only when its paired departure is on a different date in primaryTz
      const departure = e.legId
        ? timeline.find((d) => d.legId === e.legId && isTransportDeparture(d))
        : undefined;
      return !departure || eventDateInTz(departure, primaryTz) !== date;
    }
    if (e.type === 'flight' && e.subtype === 'connection') return true;
    return false;
  });

  // Scheduled activities for this date
  const scheduledActivities = activities.filter(
    (a) => a.scheduledDate === date && !!a.scheduledTime,
  );

  // Conflict detection for activities
  const activitySlots = scheduledActivities.map((a) => ({
    id: a.id,
    startMinutes: timeToMinutes(a.scheduledTime!),
    endMinutes:
      timeToMinutes(a.scheduledTime!) +
      (a.durationMinutes ?? parseDurationToMinutes(a.duration)),
  }));
  const conflictColumns = resolveConflictColumns(activitySlots);
  const maxConflictCol = Math.max(0, ...Array.from(conflictColumns.values()));
  const conflictColumnCount = maxConflictCol + 1;

  // Conflict detection for anchor events — uses UTC-aware Y positions + actual heights
  const anchorSlots = anchorEvents.flatMap((e) => {
    const top = eventToGridY(e, primaryTz);
    if (top === null) return [];
    const heightPx = getAnchorHeight(e, timeline, primaryTz);
    const startMinutes = top + GRID_START_MINUTE;
    return [{
      id: e.id,
      startMinutes,
      endMinutes: startMinutes + heightPx, // heightPx === durationMinutes since PIXELS_PER_MINUTE=1
    }];
  });
  const anchorConflictColumns = resolveConflictColumns(anchorSlots);
  const maxAnchorConflictCol = Math.max(0, ...Array.from(anchorConflictColumns.values()));
  const anchorColumnCount = maxAnchorConflictCol + 1;

  // Now indicator position
  const nowTop =
    nowMinutes !== null && isToday
      ? (nowMinutes - GRID_START_HOUR * 60) * 1
      : null;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'relative flex-1 min-w-0 border-l border-border',
        isOver && 'bg-green-50/50 dark:bg-green-900/10',
      )}
      style={{ height: GRID_HEIGHT }}
    >
      {/* Hour grid lines */}
      {HOURS.map((hour) => (
        <div
          key={hour}
          className="absolute left-0 right-0 border-t border-border/50"
          style={{ top: (hour - GRID_START_HOUR) * PIXELS_PER_HOUR }}
        />
      ))}

      {/* Half-hour grid lines (lighter) */}
      {HOURS.map((hour) => (
        <div
          key={`half-${hour}`}
          className="absolute left-0 right-0 border-t border-border/25"
          style={{ top: (hour - GRID_START_HOUR) * PIXELS_PER_HOUR + 30 }}
        />
      ))}

      {/* Current time indicator */}
      {nowTop !== null && nowTop >= 0 && nowTop <= GRID_HEIGHT && (
        <div
          className="absolute left-0 right-0 z-30 flex items-center pointer-events-none"
          style={{ top: nowTop }}
        >
          <div className="h-2 w-2 rounded-full bg-red-500 -ml-1 shrink-0" />
          <div className="flex-1 h-px bg-red-500" />
        </div>
      )}

      {/* Anchor event blocks */}
      {anchorEvents.flatMap((event) => {
        const top = eventToGridY(event, primaryTz);
        if (top === null) return [];
        const height = getAnchorHeight(event, timeline, primaryTz);
        const endTimeLabel = getArrivalLabel(event, timeline, primaryTz);
        const colIdx = anchorConflictColumns.get(event.id) ?? 0;
        return [
          <ScheduleAnchorBlock
            key={event.id}
            event={event}
            top={top}
            height={height}
            columnCount={anchorColumnCount}
            columnIndex={colIdx}
            endTimeLabel={endTimeLabel}
          />,
        ];
      })}

      {/* Scheduled activity blocks */}
      {scheduledActivities.map((activity) => {
        const top = timeToY(activity.scheduledTime!);
        const mins = activity.durationMinutes ?? parseDurationToMinutes(activity.duration);
        const height = minutesToHeight(mins);
        const colIdx = conflictColumns.get(activity.id) ?? 0;
        return (
          <ScheduleEventBlock
            key={activity.id}
            activity={activity}
            top={top}
            height={height}
            columnCount={conflictColumnCount}
            columnIndex={colIdx}
            onResizeEnd={onResizeEnd}
            onDelete={onDelete}
          />
        );
      })}
    </div>
  );
}
