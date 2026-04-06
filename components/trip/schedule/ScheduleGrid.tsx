'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { DragOverlay } from '@dnd-kit/core';
import { ScheduleTimeAxis } from './ScheduleTimeAxis';
import { ScheduleColumn } from './ScheduleColumn';
import { ScheduleAllDayRow } from './ScheduleAllDayRow';
import { ScheduleEventBlockOverlay } from './ScheduleEventBlock';
import { parseDurationToMinutes, minutesToHeight, today, formatDayShort, getTimezoneAbbr, nowMinutesInTz } from './utils';
import { GRID_HEIGHT, GRID_START_HOUR } from './constants';
import { cn } from '@/lib/utils';
import type { TimelineEvent, Activity } from '@/types';

interface Props {
  dates: string[];
  timeline: TimelineEvent[];
  activities: Activity[];
  activeActivity: Activity | null;
  activeHeight: number;
  columnWidthRef: React.MutableRefObject<number>;
  primaryTz: string;
  otherTimezones: string[];
  isTzOverrideActive: boolean;
  onTimezoneBadgeClick: () => void;
  onResizeEnd: (activityId: string, durationMinutes: number) => void;
  onDelete: (activityId: string) => void;
}

export function ScheduleGrid({
  dates,
  timeline,
  activities,
  activeActivity,
  activeHeight,
  columnWidthRef,
  primaryTz,
  otherTimezones,
  isTzOverrideActive,
  onTimezoneBadgeClick,
  onResizeEnd,
  onDelete,
}: Props) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [nowMinutes, setNowMinutes] = useState<number | null>(null);

  // Update now indicator every minute, in the primary display timezone
  useEffect(() => {
    function update() { setNowMinutes(nowMinutesInTz(primaryTz)); }
    update();
    const interval = setInterval(update, 60_000);
    return () => clearInterval(interval);
  }, [primaryTz]);

  // Track column width for drag calculations
  useEffect(() => {
    if (!gridRef.current) return;
    const observer = new ResizeObserver(() => {
      const colEl = gridRef.current?.querySelector('[data-col]') as HTMLElement | null;
      if (colEl) columnWidthRef.current = colEl.offsetWidth;
    });
    observer.observe(gridRef.current);
    return () => observer.disconnect();
  }, [columnWidthRef]);

  // Scroll to ~8am on mount
  useEffect(() => {
    const container = gridRef.current?.parentElement;
    if (container) {
      const scrollTo = (8 - GRID_START_HOUR) * 60; // 2h from grid top
      container.scrollTop = scrollTo;
    }
  }, []);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Column headers */}
      <div className="flex border-b border-border bg-card sticky top-0 z-20">
        {/* Timezone badge — always visible in the sticky header */}
        <div
          className="shrink-0 bg-card flex flex-col items-center justify-center gap-0.5 py-1"
          style={{ width: 44 }}
        >
          <button
            type="button"
            onClick={onTimezoneBadgeClick}
            title={isTzOverrideActive ? 'Display timezone overridden — click to change' : 'Change display timezone'}
            className={cn(
              'inline-flex items-center gap-0.5 rounded text-[10px] font-semibold',
              'tabular-nums px-1 py-0.5 whitespace-nowrap leading-none transition-colors',
              isTzOverrideActive
                ? 'bg-primary/20 border border-primary/40 text-primary-foreground hover:bg-primary/30'
                : 'bg-surface border border-border text-text-muted hover:bg-border hover:text-text-base',
            )}
          >
            {getTimezoneAbbr(primaryTz, dates[0]) || primaryTz.split('/').pop()?.replace(/_/g, ' ')}
            <ChevronDown className="h-3 w-3 opacity-50" />
          </button>
          {otherTimezones.length > 0 && (
            <span
              className="text-[9px] leading-none text-text-muted/60 tabular-nums cursor-default"
              title={otherTimezones
                .map((tz) => getTimezoneAbbr(tz, dates[0]) || tz)
                .join(', ')}
            >
              +{otherTimezones.length}
            </span>
          )}
        </div>
        {dates.map((date) => {
          const isToday = date === today();
          return (
            <div
              key={date}
              data-col
              className="flex-1 min-w-0 border-l border-border py-2 text-center"
            >
              <p
                className={cn(
                  'text-xs font-medium leading-tight',
                  isToday ? 'text-text-base' : 'text-text-muted',
                )}
              >
                {formatDayShort(date)}
              </p>
              <p
                className={cn(
                  'text-sm font-semibold leading-tight',
                  isToday
                    ? 'bg-primary text-primary-foreground rounded-full w-7 h-7 flex items-center justify-center mx-auto mt-0.5'
                    : 'text-text-base',
                )}
              >
                {new Date(date + 'T12:00:00').getDate()}
              </p>
            </div>
          );
        })}
      </div>

      {/* All-day events row */}
      <ScheduleAllDayRow events={timeline} dates={dates} />

      {/* Scrollable time grid */}
      <div className="overflow-y-auto flex-1">
        <div ref={gridRef} className="flex" style={{ height: GRID_HEIGHT }}>
          <ScheduleTimeAxis />
          {dates.map((date) => (
            <ScheduleColumn
              key={date}
              date={date}
              timeline={timeline}
              activities={activities}
              nowMinutes={nowMinutes}
              primaryTz={primaryTz}
              onResizeEnd={onResizeEnd}
              onDelete={onDelete}
            />
          ))}
        </div>
      </div>

      {/* Drag overlay */}
      <DragOverlay dropAnimation={null}>
        {activeActivity && (
          <ScheduleEventBlockOverlay activity={activeActivity} height={activeHeight} />
        )}
      </DragOverlay>
    </div>
  );
}
