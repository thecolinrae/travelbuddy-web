'use client';

import { GRID_START_HOUR, GRID_END_HOUR, PIXELS_PER_HOUR } from './constants';
import { cn } from '@/lib/utils';

interface Props {
  className?: string;
}

export function ScheduleTimeAxis({ className }: Props) {
  const hours = Array.from(
    { length: GRID_END_HOUR - GRID_START_HOUR + 1 },
    (_, i) => GRID_START_HOUR + i,
  );

  return (
    <div
      className={cn('relative select-none shrink-0', className)}
      style={{ width: 44 }}
      aria-hidden
    >
      {hours.map((hour) => (
        <div
          key={hour}
          className="absolute right-0 flex items-start justify-end pr-2"
          style={{
            top: (hour - GRID_START_HOUR) * PIXELS_PER_HOUR - 8,
            height: PIXELS_PER_HOUR,
          }}
        >
          <span className="text-xs text-text-muted leading-none tabular-nums">
            {hour === 0
              ? '12am'
              : hour < 12
              ? `${hour}am`
              : hour === 12
              ? '12pm'
              : `${hour - 12}pm`}
          </span>
        </div>
      ))}
    </div>
  );
}
