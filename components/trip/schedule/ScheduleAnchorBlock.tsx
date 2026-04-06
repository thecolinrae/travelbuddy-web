'use client';

import {
  Lock,
  PlaneTakeoff, PlaneLanding, GitMerge,
  BedDouble, LogOut,
  Car, Train, Ship, Bus, Navigation,
  Compass,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatTime } from './utils';
import type { TimelineEvent, TransportType } from '@/types';

// ── Label ─────────────────────────────────────────────────────────────────────

function getEventLabel(event: TimelineEvent): string {
  switch (event.type) {
    case 'flight':
      if (event.subtype === 'departure') return `${event.flightNo} → ${event.arrivalAirport}`;
      if (event.subtype === 'arrival')   return `Arrive ${event.arrivalAirport}`;
      if (event.subtype === 'connection') return `Connection · ${event.connectionAirport}`;
      return 'Flight';
    case 'hotel':
      return event.subtype === 'check_in'
        ? `Check in · ${event.hotelName}`
        : `Check out · ${event.hotelName}`;
    case 'otherTransportation':
      return event.subtype === 'departure'
        ? `Depart · ${event.arrivalLocation}`
        : `Arrive · ${event.arrivalLocation}`;
    case 'activity':
      return event.description ?? event.locationCity;
    default:
      return event.locationCity;
  }
}

// ── Icon ──────────────────────────────────────────────────────────────────────

function transportIcon(transportType: TransportType | undefined, className: string) {
  switch (transportType) {
    case 'train':                       return <Train     className={className} />;
    case 'ferry':                       return <Ship      className={className} />;
    case 'bus':                         return <Bus       className={className} />;
    case 'car_rental':                  return <Car       className={className} />;
    case 'taxi': case 'rideshare':      return <Navigation className={className} />;
    default:                            return <Car       className={className} />;
  }
}

function EventIcon({ event, className }: { event: TimelineEvent; className: string }) {
  switch (event.type) {
    case 'flight':
      if (event.subtype === 'departure')  return <PlaneTakeoff className={className} />;
      if (event.subtype === 'arrival')    return <PlaneLanding className={className} />;
      return <GitMerge className={className} />;        // connection
    case 'hotel':
      return event.subtype === 'check_in'
        ? <BedDouble className={className} />
        : <LogOut    className={className} />;
    case 'otherTransportation':
      return transportIcon(event.transportType, className);
    case 'activity':
      return <Compass className={className} />;
    default:
      return <Compass className={className} />;
  }
}

// ── Colours ───────────────────────────────────────────────────────────────────

interface BlockStyle {
  block: string;
  icon: string;
}

function getBlockStyle(event: TimelineEvent): BlockStyle {
  switch (event.type) {
    case 'flight':
      return {
        block: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300',
        icon:  'text-blue-500 dark:text-blue-400',
      };
    case 'hotel':
      return {
        block: 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800 text-orange-800 dark:text-orange-300',
        icon:  'text-orange-500 dark:text-orange-400',
      };
    case 'otherTransportation': {
      const t = (event as { transportType?: TransportType }).transportType;
      if (t === 'train' || t === 'ferry' || t === 'bus') {
        return {
          block: 'bg-cyan-50 dark:bg-cyan-900/20 border-cyan-200 dark:border-cyan-800 text-cyan-800 dark:text-cyan-300',
          icon:  'text-cyan-500 dark:text-cyan-400',
        };
      }
      return {
        block: 'bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800 text-sky-800 dark:text-sky-300',
        icon:  'text-sky-500 dark:text-sky-400',
      };
    }
    case 'activity':
      return {
        block: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-800 dark:text-green-300',
        icon:  'text-green-600 dark:text-green-500',
      };
    default:
      return {
        block: 'bg-surface border-border text-text-muted',
        icon:  'text-text-muted',
      };
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  event: TimelineEvent;
  top: number;
  height: number;
  columnCount: number;
  columnIndex: number;
  /** Arrival time string (e.g. "5:30pm") for transport departure blocks. */
  endTimeLabel?: string;
}

export function ScheduleAnchorBlock({ event, top, height, columnCount, columnIndex, endTimeLabel }: Props) {
  const label = getEventLabel(event);
  const { block, icon } = getBlockStyle(event);
  const isShort = height < 32;
  const time = event.time ? formatTime(event.time) : null;

  const widthPct = 100 / columnCount;
  const leftPct = columnIndex * widthPct;

  return (
    <div
      className={cn(
        'absolute rounded-lg border px-2 py-1 overflow-hidden',
        'opacity-85 cursor-default select-none',
        block,
      )}
      style={{
        top,
        height: Math.max(height, 20),
        left: `${leftPct}%`,
        width: `calc(${widthPct}% - 4px)`,
      }}
      title={label}
    >
      <div className={cn('flex items-start gap-1', isShort && 'items-center')}>
        <EventIcon event={event} className={cn('h-3 w-3 shrink-0 mt-0.5', icon)} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium leading-tight truncate">{label}</p>
          {!isShort && time && (
            <p className="text-xs opacity-70 leading-tight mt-0.5 tabular-nums">
              {endTimeLabel ? `${time} → ${endTimeLabel}` : time}
            </p>
          )}
        </div>
        <Lock className="h-2.5 w-2.5 shrink-0 opacity-30 mt-0.5" />
      </div>
    </div>
  );
}
