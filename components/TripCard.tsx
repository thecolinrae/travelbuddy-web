import Link from 'next/link';
import Image from 'next/image';
import type { TripRow } from '@/services/db';

function formatDateRange(start: string | null, end: string | null): string {
  if (!start && !end) return '';
  const fmt = (d: string) =>
    new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  if (start && end && start !== end) return `${fmt(start)} – ${fmt(end)}`;
  if (start) return fmt(start);
  return fmt(end!);
}

const STATUS_BAR: Record<string, string> = {
  active:    'bg-primary',
  upcoming:  'bg-secondary',
  completed: 'bg-muted',
};

const STATUS_BADGE: Record<string, string> = {
  active:    'bg-primary/15 text-primary-foreground border border-primary/30',
  upcoming:  'bg-secondary/10 text-secondary border border-secondary/20 dark:text-blue-400',
  completed: 'bg-muted text-text-muted border border-border',
};

const STATUS_LABEL: Record<string, string> = {
  active:    'Active',
  upcoming:  'Upcoming',
  completed: 'Completed',
};

interface Props {
  trip: TripRow;
}

export function TripCard({ trip }: Props) {
  const destinations =
    trip.destinations?.length ? trip.destinations.join(' · ') : trip.destination;
  const dateRange = formatDateRange(trip.startDate, trip.endDate);
  const statusBar = STATUS_BAR[trip.status] ?? STATUS_BAR.upcoming;
  const statusBadge = STATUS_BADGE[trip.status] ?? STATUS_BADGE.upcoming;
  const statusLabel = STATUS_LABEL[trip.status] ?? trip.status;

  return (
    <Link
      href={`/trip/${trip.id}`}
      className="group block rounded-xl border bg-card overflow-hidden transition-shadow hover:shadow-lg"
    >
      {/* Cover photo */}
      <div className="relative h-36">
        {trip.coverPhotoUrl ? (
          <Image
            src={trip.coverPhotoUrl}
            alt={trip.destination}
            fill
            className="object-cover dark:brightness-75"
            sizes="(max-width: 768px) 100vw, 672px"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/60 to-yellow-600" />
        )}
        {/* Status bar at bottom of photo */}
        <div className={`absolute bottom-0 left-0 right-0 h-1 ${statusBar}`} />
      </div>

      {/* Content */}
      <div className="p-4 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display font-semibold text-base leading-snug group-hover:text-primary-dark transition-colors truncate">
            {trip.name}
          </h3>
          <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${statusBadge}`}>
            {statusLabel}
          </span>
        </div>
        {destinations && (
          <p className="type-caption truncate">{destinations}</p>
        )}
        {dateRange && (
          <p className="type-caption">{dateRange}</p>
        )}
      </div>
    </Link>
  );
}
