'use client';

import { BedDouble, LogOut, PlaneTakeoff, PlaneLanding, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TimelineEvent } from '@/types';

interface Props {
  events: TimelineEvent[];
  dates: string[];
}

function isAllDayEvent(event: TimelineEvent): boolean {
  return !event.time;
}

function AllDayChip({ event }: { event: TimelineEvent }) {
  let label = '';
  let colorClass = '';
  let Icon = AlertCircle;

  if (event.type === 'hotel' && event.subtype === 'check_in') {
    label = `Check in · ${event.hotelName}`;
    colorClass = 'bg-orange-50 dark:bg-orange-900/20 text-orange-800 dark:text-orange-300 border-orange-200 dark:border-orange-800';
    Icon = BedDouble;
  } else if (event.type === 'hotel' && event.subtype === 'check_out') {
    label = `Check out · ${event.hotelName}`;
    colorClass = 'bg-orange-50 dark:bg-orange-900/20 text-orange-800 dark:text-orange-300 border-orange-200 dark:border-orange-800';
    Icon = LogOut;
  } else if (event.type === 'flight' && event.subtype === 'departure') {
    label = `Flight ${event.flightNo}`;
    colorClass = 'bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800';
    Icon = PlaneTakeoff;
  } else if (event.type === 'flight' && event.subtype === 'arrival') {
    label = `Arrive ${event.arrivalAirport}`;
    colorClass = 'bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800';
    Icon = PlaneLanding;
  } else {
    label = event.locationCity;
    colorClass = 'bg-surface border-border text-text-muted';
  }

  return (
    <div className={cn('flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium', colorClass)}>
      <Icon className="h-3 w-3 shrink-0" />
      <span className="truncate">{label}</span>
    </div>
  );
}

export function ScheduleAllDayRow({ events, dates }: Props) {
  const allDayEvents = events.filter(isAllDayEvent);
  if (allDayEvents.length === 0) return null;

  return (
    <div className="flex border-b border-border">
      {/* Axis spacer */}
      <div className="shrink-0" style={{ width: 44 }} />
      {/* Columns */}
      {dates.map((date) => {
        const dayEvents = allDayEvents.filter((e) => e.date === date);
        return (
          <div
            key={date}
            className="flex-1 min-w-0 border-l border-border px-1 py-1 flex flex-wrap gap-1"
          >
            {dayEvents.map((e) => (
              <AllDayChip key={e.id} event={e} />
            ))}
          </div>
        );
      })}
    </div>
  );
}
