'use client';

import Link from 'next/link';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDateLabel, addDays } from './utils';
import type { ScheduleView } from './constants';

interface Props {
  tripId: string;
  tripName: string;
  centerDate: string;
  view: ScheduleView;
  onViewChange: (v: ScheduleView) => void;
  onCenterDateChange: (d: string) => void;
  returnDayIndex?: number;
}

const VIEW_OPTIONS: { value: ScheduleView; label: string }[] = [
  { value: 'day', label: '1 Day' },
  { value: '3day', label: '3 Days' },
  { value: 'week', label: 'Week' },
];

function navStep(view: ScheduleView): number {
  if (view === 'day') return 1;
  if (view === '3day') return 3;
  return 7;
}

export function ScheduleHeader({
  tripId,
  tripName,
  centerDate,
  view,
  onViewChange,
  onCenterDateChange,
  returnDayIndex,
}: Props) {
  const step = navStep(view);
  const label = formatDateLabel(centerDate);

  return (
    <div className="bg-card border-b border-border sticky top-0 z-30">
      {/* Yellow accent bar */}
      <div className="h-1 bg-primary" />

      <div className="flex items-center gap-3 px-4 py-3">
        {/* Back */}
        <Link
          href={`/trip/${tripId}${returnDayIndex !== undefined ? `?dayIndex=${returnDayIndex}` : ''}`}
          className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text-base transition-colors shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Back</span>
        </Link>

        {/* Trip name */}
        <h1 className="font-display font-semibold text-base leading-snug flex-1 truncate">
          {tripName}
        </h1>

        {/* View toggle */}
        <div className="flex items-center rounded-lg border border-border overflow-hidden shrink-0">
          {VIEW_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onViewChange(opt.value)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium transition-colors',
                view === opt.value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-text-muted hover:text-text-base hover:bg-surface',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Date navigation */}
      <div className="flex items-center justify-between px-4 pb-3 gap-3">
        <button
          onClick={() => onCenterDateChange(addDays(centerDate, -step))}
          className="flex items-center justify-center h-7 w-7 rounded-full hover:bg-surface transition-colors text-text-muted hover:text-text-base"
          aria-label="Previous"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <p className="text-sm font-medium text-text-base">{label}</p>

        <button
          onClick={() => onCenterDateChange(addDays(centerDate, step))}
          className="flex items-center justify-center h-7 w-7 rounded-full hover:bg-surface transition-colors text-text-muted hover:text-text-base"
          aria-label="Next"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
