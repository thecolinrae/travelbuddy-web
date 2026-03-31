'use client';

import React from 'react';
import { CalendarDays, Route, UtensilsCrossed, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DayNav } from './day/DayNav';
import { NowIndicator } from './day/NowIndicator';
import { FlightCard } from './day/FlightCard';
import { HotelCard } from './day/HotelCard';
import { TransportCard } from './day/TransportCard';
import { ActivityEventCard, ScheduledActivityCard } from './day/ActivityCard';
import {
  buildDayRange,
  buildDayItems,
  injectNowIndicator,
  type DayItem,
} from './day/utils';
import type { TimelineEvent, Activity } from '@/types';

interface TripSnapshot {
  startDate: string | null;
  endDate: string | null;
  status: string;
}

export interface LegSummary {
  id: string;
  name: string | null;
}

interface DayTabProps {
  trip: TripSnapshot;
  tripId: string;
  timeline: TimelineEvent[];
  activities: Activity[];
  legs?: LegSummary[];
  isOwner: boolean;
  currentIndex: number;
  onIndexChange: (index: number) => void;
  onViewTimeline?: () => void;
  onActivityUpdate: (updated: Activity[]) => void;
}

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function getNowTime(): string {
  return new Date().toTimeString().slice(0, 5);
}

function EmptyDayState() {
  return (
    <div className="py-16 flex flex-col items-center gap-4 text-center">
      <div className="rounded-full bg-surface p-4">
        <CalendarDays className="h-8 w-8 text-text-muted" />
      </div>
      <div className="space-y-1">
        <p className="font-semibold text-text-base">No plans for this day</p>
        <p className="type-caption max-w-xs">
          Add activities in the Activities tab to fill this day.
        </p>
      </div>
    </div>
  );
}

function PlanThisDayStub() {
  return (
    <div className="rounded-xl border-2 border-dashed bg-surface px-4 py-4 space-y-3">
      <div className="flex items-center gap-2">
        <Route className="h-4 w-4 text-text-muted" />
        <p className="text-sm font-medium text-text-muted">Plan this day</p>
      </div>
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" variant="outline" disabled className="gap-1.5 opacity-50 cursor-not-allowed">
          <Route className="h-4 w-4" />
          Optimize route
        </Button>
        <Button size="sm" variant="outline" disabled className="gap-1.5 opacity-50 cursor-not-allowed">
          <UtensilsCrossed className="h-4 w-4" />
          Add meal break
        </Button>
      </div>
      <p className="type-caption text-text-muted">Distance-aware scheduling — coming soon</p>
    </div>
  );
}

interface RenderContext {
  tripId: string;
  activities: Activity[];
  isOwner: boolean;
  onActivityUpdate: (updated: Activity[]) => void;
}

function renderItem(
  item: DayItem,
  isPast: boolean,
  isFirstFuture: boolean,
  nowTime: string,
  ctx: RenderContext,
) {
  if (item.kind === 'now') {
    return <NowIndicator key="now" time={nowTime} />;
  }

  const wrapperClass = [
    isPast ? 'opacity-60' : '',
    isFirstFuture ? 'border-l-2 border-primary pl-3 -ml-3' : '',
  ].filter(Boolean).join(' ');

  let card: React.ReactNode;

  if (item.kind === 'activity') {
    card = (
      <ScheduledActivityCard
        activity={item.activity}
        tripId={ctx.tripId}
        activities={ctx.activities}
        isOwner={ctx.isOwner}
        onActivityUpdate={ctx.onActivityUpdate}
      />
    );
  } else {
    const e = item.event;
    if (e.type === 'flight') {
      card = <FlightCard event={e} />;
    } else if (e.type === 'hotel') {
      card = <HotelCard event={e} />;
    } else if (e.type === 'otherTransportation') {
      card = <TransportCard event={e} />;
    } else if (e.type === 'activity') {
      card = <ActivityEventCard event={e} />;
    } else {
      return null;
    }
  }

  if (!wrapperClass) return card;
  return <div className={wrapperClass}>{card}</div>;
}

// ─── Leg grouping ─────────────────────────────────────────────────────────────

interface ItemWithIdx { item: DayItem; idx: number }
type RenderSegment =
  | { kind: 'solo'; entry: ItemWithIdx }
  | { kind: 'leg-group'; legId: string; legName: string; entries: ItemWithIdx[] };

/**
 * Group consecutive transport events that share the same named legId into a
 * single segment. Everything else (activities, hotels, the now indicator, and
 * transport events with no leg name) is emitted as a solo segment.
 */
function buildSegments(items: DayItem[], legNameById: Map<string, string | null>): RenderSegment[] {
  const segments: RenderSegment[] = [];
  let i = 0;
  while (i < items.length) {
    const item = items[i];
    const legId =
      item.kind === 'timeline' &&
      (item.event.type === 'flight' || item.event.type === 'otherTransportation') &&
      item.event.legId
        ? item.event.legId
        : null;
    const legName = legId ? (legNameById.get(legId) ?? null) : null;

    if (legId && legName) {
      const entries: ItemWithIdx[] = [{ item, idx: i }];
      let j = i + 1;
      while (j < items.length) {
        const next = items[j];
        const matches =
          next.kind === 'timeline' &&
          (next.event.type === 'flight' || next.event.type === 'otherTransportation') &&
          next.event.legId === legId;
        if (!matches) break;
        entries.push({ item: next, idx: j });
        j++;
      }
      segments.push({ kind: 'leg-group', legId, legName, entries });
      i = j;
    } else {
      segments.push({ kind: 'solo', entry: { item, idx: i } });
      i++;
    }
  }
  return segments;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DayTab({ trip, tripId, timeline, activities, legs, isOwner, currentIndex, onIndexChange, onViewTimeline, onActivityUpdate }: DayTabProps) {
  // Build a map of legId → leg name for grouping transport events
  const legNameById = new Map<string, string | null>(
    (legs ?? []).map((l) => [l.id, l.name]),
  );
  const days = buildDayRange(trip.startDate, trip.endDate, timeline, activities);

  if (days.length === 0) {
    return (
      <div className="space-y-6">
        <EmptyDayState />
        <PlanThisDayStub />
      </div>
    );
  }

  const selectedDay = days[currentIndex];
  const today = getToday();
  const isToday = selectedDay === today;
  const nowTime = getNowTime();

  const showJumpToToday =
    trip.status === 'active' &&
    days.includes(today) &&
    selectedDay !== today;

  let items = buildDayItems(selectedDay, timeline, activities);
  if (isToday) {
    items = injectNowIndicator(items, nowTime);
  }

  // Determine now marker index for past/future classification
  const nowIndex = items.findIndex((i) => i.kind === 'now');
  // First future item is the first non-'now' item after the now marker
  const firstFutureIndex = nowIndex !== -1 ? nowIndex + 1 : -1;

  const contentItems = items.filter((i) => i.kind !== 'now');
  const isEmpty = contentItems.length === 0;

  const segments = buildSegments(items, legNameById);

  return (
    <div className="space-y-4">
      <DayNav
        days={days}
        currentIndex={currentIndex}
        tripStartDate={trip.startDate}
        showJumpToToday={showJumpToToday}
        onPrev={() => onIndexChange(Math.max(0, currentIndex - 1))}
        onNext={() => onIndexChange(Math.min(days.length - 1, currentIndex + 1))}
        onJumpToToday={() => onIndexChange(days.indexOf(today))}
      />

      <div className="space-y-3">
        {isEmpty ? (
          <EmptyDayState />
        ) : segments.map((seg) => {
          if (seg.kind === 'solo') {
            const { item, idx } = seg.entry;
            const isPast = isToday && nowIndex !== -1 && idx < nowIndex;
            const isFirstFuture = isToday && idx === firstFutureIndex;
            const key =
              item.kind === 'now' ? 'now'
              : item.kind === 'activity' ? item.activity.id
              : item.event.id;
            return (
              <div key={key}>
                {renderItem(item, isPast, isFirstFuture, nowTime, { tripId, activities, isOwner, onActivityUpdate })}
              </div>
            );
          }

          // Leg group: render a named header + visually grouped events
          const allPast = isToday && nowIndex !== -1 && seg.entries.every(({ idx }) => idx < nowIndex);
          const isMulti = seg.entries.length > 1;
          return (
            <div key={`leg-${seg.legId}`} className={allPast ? 'opacity-60' : ''}>
              <p className="text-xs font-medium text-text-muted uppercase tracking-wide pb-1.5">
                {seg.legName}
              </p>
              <div className={isMulti ? 'pl-3 border-l-2 border-secondary/30 space-y-2' : ''}>
                {seg.entries.map(({ item, idx }) => {
                  const isPast = isToday && nowIndex !== -1 && idx < nowIndex;
                  const isFirstFuture = isToday && idx === firstFutureIndex;
                  const key = item.kind === 'activity' ? item.activity.id : (item.kind === 'timeline' ? item.event.id : 'now');
                  return (
                    <div key={key}>
                      {renderItem(item, false, isFirstFuture, nowTime, { tripId, activities, isOwner, onActivityUpdate })}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {onViewTimeline && (
        <button
          onClick={onViewTimeline}
          className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text-base transition-colors w-full justify-center py-1"
        >
          <List className="h-4 w-4" />
          View all events
        </button>
      )}

      <PlanThisDayStub />
    </div>
  );
}
