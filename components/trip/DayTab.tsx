'use client';

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

interface DayTabProps {
  trip: TripSnapshot;
  timeline: TimelineEvent[];
  activities: Activity[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
  onViewTimeline?: () => void;
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

function renderItem(item: DayItem, isPast: boolean, isFirstFuture: boolean, nowTime: string) {
  if (item.kind === 'now') {
    return <NowIndicator key="now" time={nowTime} />;
  }

  const wrapperClass = [
    isPast ? 'opacity-60' : '',
    isFirstFuture ? 'border-l-2 border-primary pl-3 -ml-3' : '',
  ].filter(Boolean).join(' ');

  let card: React.ReactNode;

  if (item.kind === 'activity') {
    card = <ScheduledActivityCard activity={item.activity} />;
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

export function DayTab({ trip, timeline, activities, currentIndex, onIndexChange, onViewTimeline }: DayTabProps) {
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
        ) : (
          items.map((item, idx) => {
            const isPast = isToday && nowIndex !== -1 && idx < nowIndex;
            const isFirstFuture = isToday && idx === firstFutureIndex;
            const key =
              item.kind === 'now'
                ? 'now'
                : item.kind === 'activity'
                ? item.activity.id
                : item.event.id;
            return (
              <div key={key}>
                {renderItem(item, isPast, isFirstFuture, nowTime)}
              </div>
            );
          })
        )}
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
