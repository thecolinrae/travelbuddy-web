import { ChevronLeft, ChevronRight, CalendarDays, Map } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDayLabel } from './utils';

interface DayNavProps {
  days: string[];
  currentIndex: number;
  tripStartDate: string | null;
  showJumpToToday: boolean;
  onPrev: () => void;
  onNext: () => void;
  onJumpToToday: () => void;
  mapOpen?: boolean;
  onToggleMap?: () => void;
}

export function DayNav({
  days,
  currentIndex,
  tripStartDate,
  showJumpToToday,
  onPrev,
  onNext,
  onJumpToToday,
  mapOpen,
  onToggleMap,
}: DayNavProps) {
  const selectedDay = days[currentIndex] ?? '';

  return (
    <div className="flex items-center justify-between gap-3 py-3 px-1">
      <Button
        variant="ghost"
        size="icon"
        onClick={onPrev}
        disabled={currentIndex === 0}
        className="shrink-0"
        aria-label="Previous day"
      >
        <ChevronLeft className="h-5 w-5" />
      </Button>

      <div className="flex-1 text-center">
        <p className="font-display font-semibold text-base leading-snug">
          {selectedDay ? formatDayLabel(selectedDay, tripStartDate) : '—'}
        </p>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {showJumpToToday && (
          <Button
            variant="outline"
            size="sm"
            onClick={onJumpToToday}
            className="gap-1.5 text-xs"
          >
            <CalendarDays className="h-3.5 w-3.5" />
            Today
          </Button>
        )}
        {onToggleMap && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleMap}
            aria-label={mapOpen ? 'Hide map' : 'Show map'}
            className={mapOpen ? 'bg-surface text-text-base' : 'text-text-muted'}
          >
            <Map className="h-4 w-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onNext}
          disabled={currentIndex === days.length - 1}
          aria-label="Next day"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
