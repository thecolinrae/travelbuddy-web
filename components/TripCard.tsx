import Link from 'next/link';
import type { TripRow } from '@/services/db';

function formatDateRange(start: string | null, end: string | null): string {
  if (!start && !end) return '';
  const fmt = (d: string) =>
    new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  if (start && end && start !== end) return `${fmt(start)} – ${fmt(end)}`;
  if (start) return fmt(start);
  return fmt(end!);
}

const STATUS_BADGE: Record<string, string> = {
  active:    'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  upcoming:  'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  completed: 'bg-muted text-muted-foreground',
};

interface Props {
  trip: TripRow;
}

export function TripCard({ trip }: Props) {
  const destinations =
    trip.destinations?.length ? trip.destinations.join(' · ') : trip.destination;
  const dateRange = formatDateRange(trip.startDate, trip.endDate);

  return (
    <Link
      href={`/trip/${trip.id}`}
      className="group flex items-start gap-4 rounded-xl border bg-card p-4 transition-shadow hover:shadow-md"
    >
      <div className="shrink-0 w-10 h-10 rounded-lg bg-surface" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-base leading-tight truncate group-hover:text-primary transition-colors">
            {trip.name}
          </p>
          <span
            className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full capitalize ${STATUS_BADGE[trip.status] ?? STATUS_BADGE.upcoming}`}
          >
            {trip.status}
          </span>
        </div>
        {destinations && (
          <p className="text-sm text-muted-foreground mt-0.5 truncate">{destinations}</p>
        )}
        {dateRange && (
          <p className="text-xs text-muted-foreground mt-1">{dateRange}</p>
        )}
      </div>
    </Link>
  );
}
