'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { CategoryIcon } from '@/components/trip/activityIcons';
import { DayPreviewList } from './DayPreviewList';
import { getCityDateRanges } from './activityUtils';
import { buildDayItems, formatDayLabel } from '@/components/trip/day/utils';
import type { Activity, TimelineEvent } from '@/types';

interface ScheduleSheetProps {
  activity: Activity | null;
  timeline: TimelineEvent[];
  activities: Activity[];
  tripStartDate: string | null;
  tripEndDate: string | null;
  onSchedule: (activityId: string, date: string, time: string) => void;
  onClear: (activityId: string) => void;
  onClose: () => void;
}

function shortDate(date: string): string {
  return new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function ScheduleSheet({
  activity,
  timeline,
  activities,
  tripStartDate,
  tripEndDate,
  onSchedule,
  onClear,
  onClose,
}: ScheduleSheetProps) {
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');

  // Sync state when activity changes (e.g. opening for a different activity)
  useEffect(() => {
    setSelectedDate(activity?.scheduledDate ?? '');
    setSelectedTime(activity?.scheduledTime ?? '');
  }, [activity?.id, activity?.scheduledDate, activity?.scheduledTime]);

  const suggestedDates = activity ? getCityDateRanges(activity.city, timeline) : [];
  const dayItems = selectedDate ? buildDayItems(selectedDate, timeline, activities) : [];

  function handleSave() {
    if (!activity || !selectedDate) return;
    onSchedule(activity.id, selectedDate, selectedTime);
  }

  function handleClear() {
    if (!activity) return;
    onClear(activity.id);
  }

  return (
    <Sheet open={!!activity} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="flex flex-col w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="shrink-0">
          <SheetTitle className="font-display font-semibold text-xl leading-snug">
            {activity?.name ?? ''}
          </SheetTitle>
          {activity && (
            <div className="flex items-center gap-2 mt-1">
              <CategoryIcon type={activity.type} />
              <Badge variant="outline" className="text-xs capitalize font-normal">
                {activity.type}
              </Badge>
              {activity.city && (
                <span className="type-caption">{activity.city}</span>
              )}
            </div>
          )}
        </SheetHeader>

        <div className="flex-1 space-y-6 py-4">
          {/* Suggested dates */}
          {suggestedDates.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-text-muted uppercase tracking-wide">
                Suggested dates
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                {suggestedDates.slice(0, 7).map(({ date, reason }) => (
                  <button
                    key={date}
                    onClick={() => setSelectedDate(date)}
                    className={cn(
                      'shrink-0 rounded-lg border px-3 py-2 text-left transition-colors',
                      selectedDate === date
                        ? 'bg-primary/10 border-primary text-text-base'
                        : 'bg-card border-border text-text-muted hover:border-primary/50 hover:text-text-base',
                    )}
                  >
                    <p className="text-xs font-medium whitespace-nowrap">{shortDate(date)}</p>
                    {tripStartDate && (
                      <p className="type-caption whitespace-nowrap">
                        {formatDayLabel(date, tripStartDate).split(' · ')[1] ?? ''}
                      </p>
                    )}
                    <p className="type-caption whitespace-nowrap mt-0.5">{reason}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Date + time pickers */}
          <div className="space-y-3">
            <p className="text-xs font-medium text-text-muted uppercase tracking-wide">
              Date & time
            </p>
            <div className="flex gap-3">
              <div className="space-y-1.5 flex-1">
                <Label htmlFor="sched-date">Date</Label>
                <Input
                  id="sched-date"
                  type="date"
                  value={selectedDate}
                  min={tripStartDate ?? undefined}
                  max={tripEndDate ?? undefined}
                  onChange={(e) => setSelectedDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5 flex-1">
                <Label htmlFor="sched-time">Time (optional)</Label>
                <Input
                  id="sched-time"
                  type="time"
                  value={selectedTime}
                  onChange={(e) => setSelectedTime(e.target.value)}
                />
              </div>
            </div>
            {activity?.scheduledDate && (
              <button
                onClick={handleClear}
                className="type-caption text-text-muted hover:text-destructive transition-colors"
              >
                Clear schedule
              </button>
            )}
          </div>

          {/* Day preview */}
          {selectedDate && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-text-muted uppercase tracking-wide">
                What&apos;s on this day
              </p>
              <div className="rounded-xl border bg-surface p-3">
                <DayPreviewList items={dayItems} />
              </div>
            </div>
          )}
        </div>

        <SheetFooter className="shrink-0 pt-2 border-t border-border">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={!selectedDate}
            className="bg-primary text-primary-foreground hover:bg-primary-dark font-semibold"
          >
            Schedule
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
