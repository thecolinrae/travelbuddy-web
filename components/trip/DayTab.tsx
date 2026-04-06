'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, Route, UtensilsCrossed, List, CalendarRange } from 'lucide-react';
import { DayMapPanel } from '@/components/trip/map/DayMapPanel';
import { Button } from '@/components/ui/button';
import { DayNav } from './day/DayNav';
import { NowIndicator } from './day/NowIndicator';
import { FlightCard } from './day/FlightCard';
import { HotelCard } from './day/HotelCard';
import { TransportCard } from './day/TransportCard';
import { ActivityEventCard, ScheduledActivityCard } from './day/ActivityCard';
import { MergeSuggestionChip } from './day/MergeActivityModal';
import {
  buildDayRange,
  buildDayItems,
  injectNowIndicator,
  type DayItem,
} from './day/utils';
import { findMergeCandidates } from '@/services/activityMerge';
import type { TimelineEvent, Activity, ActivityEvent } from '@/types';

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
  timeline: ActivityEvent[];
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
        timeline={ctx.timeline}
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
      const linkedActivity = e.linkedActivityId
        ? ctx.activities.find((a) => a.id === e.linkedActivityId)
        : undefined;
      card = (
        <ActivityEventCard
          event={e}
          linkedActivity={linkedActivity}
          tripId={ctx.tripId}
          activities={ctx.activities}
          timeline={ctx.timeline}
          isOwner={ctx.isOwner}
          onActivityUpdate={ctx.onActivityUpdate}
        />
      );
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

function getItemId(item: DayItem): string | null {
  if (item.kind === 'activity') return item.activity.id;
  if (item.kind === 'timeline') return item.event.id;
  return null;
}

export function DayTab({ trip, tripId, timeline, activities, legs, isOwner, currentIndex, onIndexChange, onViewTimeline, onActivityUpdate }: DayTabProps) {
  const router = useRouter();
  const [mapOpen, setMapOpen] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  // Pairs dismissed by the user for this session ("activityId|eventId")
  const [dismissedPairs, setDismissedPairs] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!selectedItemId) return;
    const el = document.querySelector(`[data-item-id="${selectedItemId}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selectedItemId]);

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

  // ActivityEvent subset for this day (used by detail sheets + merge suggestions)
  const dayActivityEvents = timeline.filter(
    (e): e is ActivityEvent => e.type === 'activity' && e.date === selectedDay,
  );

  // Compute merge suggestions for unlinked pairs on this day (owner only)
  const dayPlannedActivities = items
    .filter((i): i is { kind: 'activity'; activity: Activity } => i.kind === 'activity')
    .map((i) => i.activity);
  const suggestionMap = new Map(
    (isOwner
      ? findMergeCandidates(dayPlannedActivities, dayActivityEvents)
          .filter((c) => !c.autoMerge && !dismissedPairs.has(`${c.activity.id}|${c.event.id}`))
      : []
    ).map((c) => [c.activity.id, c]),
  );

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
        mapOpen={mapOpen}
        onToggleMap={isEmpty ? undefined : () => setMapOpen((v) => !v)}
      />

      {mapOpen && !isEmpty && (
        <DayMapPanel
          key={`${selectedDay}-${items
            .filter((i) => i.kind !== 'now')
            .map((i) => (i.kind === 'activity' ? i.activity.id : i.event.id))
            .join(',')}`}
          items={items}
          selectedId={selectedItemId ?? undefined}
          onSelect={setSelectedItemId}
        />
      )}

      <div className="space-y-3">
        {isEmpty ? (
          <EmptyDayState />
        ) : segments.map((seg, segIdx) => {
          if (seg.kind === 'solo') {
            const { item, idx } = seg.entry;
            const isPast = isToday && nowIndex !== -1 && idx < nowIndex;
            const isFirstFuture = isToday && idx === firstFutureIndex;
            const key =
              item.kind === 'now' ? 'now'
              : item.kind === 'activity' ? item.activity.id
              : item.event.id;
            const itemId = getItemId(item);
            const isSelected = !!itemId && selectedItemId === itemId;
            return (
              <div
                key={key}
                data-item-id={itemId ?? key}
                className={isSelected ? 'rounded-xl ring-2 ring-primary/60 transition-shadow' : ''}
              >
                {renderItem(item, isPast, isFirstFuture, nowTime, { tripId, activities, timeline: dayActivityEvents, isOwner, onActivityUpdate })}
                {item.kind === 'activity' && suggestionMap.has(item.activity.id) && (
                  <MergeSuggestionChip
                    candidate={suggestionMap.get(item.activity.id)!}
                    tripId={tripId}
                    onDismiss={() =>
                      setDismissedPairs((prev) => {
                        const next = new Set(prev);
                        const c = suggestionMap.get(item.activity.id)!;
                        next.add(`${c.activity.id}|${c.event.id}`);
                        return next;
                      })
                    }
                  />
                )}
              </div>
            );
          }

          // Leg group: render a named header + visually grouped events
          const allPast = isToday && nowIndex !== -1 && seg.entries.every(({ idx }) => idx < nowIndex);
          const isMulti = seg.entries.length > 1;
          return (
            <div key={`leg-${seg.legId}-${segIdx}`} className={allPast ? 'opacity-60' : ''}>
              <p className="text-xs font-medium text-text-muted uppercase tracking-wide pb-1.5">
                {seg.legName}
              </p>
              <div className={isMulti ? 'pl-3 border-l-2 border-secondary/30 space-y-2' : ''}>
                {seg.entries.map(({ item, idx }) => {
                  const isPast = isToday && nowIndex !== -1 && idx < nowIndex;
                  const isFirstFuture = isToday && idx === firstFutureIndex;
                  const key = item.kind === 'activity' ? item.activity.id : (item.kind === 'timeline' ? item.event.id : 'now');
                  const itemId = getItemId(item);
                  const isSelected = !!itemId && selectedItemId === itemId;
                  return (
                    <div
                      key={key}
                      data-item-id={itemId ?? key}
                      className={isSelected ? 'rounded-xl ring-2 ring-primary/60 transition-shadow' : ''}
                    >
                      {renderItem(item, false, isFirstFuture, nowTime, { tripId, activities, timeline: dayActivityEvents, isOwner, onActivityUpdate })}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-center gap-6">
        {onViewTimeline && (
          <button
            onClick={onViewTimeline}
            className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text-base transition-colors py-1"
          >
            <List className="h-4 w-4" />
            View all events
          </button>
        )}
        <button
          onClick={() => {
            const date = days[currentIndex] ?? days[0];
            router.push(
              `/trip/${tripId}/schedule?date=${date}&view=day&dayIndex=${currentIndex}`,
            );
          }}
          className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text-base transition-colors py-1"
        >
          <CalendarRange className="h-4 w-4" />
          Edit schedule
        </button>
      </div>

      <PlanThisDayStub />
    </div>
  );
}
