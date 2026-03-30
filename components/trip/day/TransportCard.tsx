import { Bus, Train, Ship, Car, Navigation, ArrowRight } from 'lucide-react';
import { fmt12 } from './utils';
import type { TransportDepartureEvent, TransportArrivalEvent, TransportType } from '@/types';

type TransportEvent = TransportDepartureEvent | TransportArrivalEvent;

interface TransportCardProps {
  event: TransportEvent;
}

const TRANSPORT_ICONS: Record<TransportType, React.ComponentType<{ className?: string }>> = {
  bus: Bus,
  train: Train,
  ferry: Ship,
  car_rental: Car,
  taxi: Car,
  rideshare: Car,
  other: Navigation,
};

const TRANSPORT_LABELS: Record<TransportType, string> = {
  bus: 'Bus',
  train: 'Train',
  ferry: 'Ferry',
  car_rental: 'Car rental',
  taxi: 'Taxi',
  rideshare: 'Rideshare',
  other: 'Transport',
};

function DepartureCard({ event }: { event: TransportDepartureEvent }) {
  const Icon = TRANSPORT_ICONS[event.transportType] ?? Navigation;
  const label = TRANSPORT_LABELS[event.transportType] ?? 'Transport';

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      {/* Route */}
      <div>
        <p className="font-display font-bold text-xl leading-tight">
          {event.departureLocation} → {event.arrivalLocation}
        </p>
        <p className="text-sm text-text-muted mt-0.5 flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </p>
      </div>

      {/* Time */}
      {event.time && (
        <p className="text-2xl font-bold text-text-base tabular-nums">{fmt12(event.time)}</p>
      )}

      {/* Detail row */}
      {(event.vendor || event.bookingRef) && (
        <div className="flex items-center justify-between gap-4">
          {event.vendor && (
            <p className="text-sm text-text-muted">{event.vendor}</p>
          )}
          {event.bookingRef && (
            <p className="text-xs text-text-muted ml-auto">{event.bookingRef}</p>
          )}
        </div>
      )}

      {event.notes && (
        <p className="text-xs text-text-muted">{event.notes}</p>
      )}
    </div>
  );
}

function ArrivalCard({ event }: { event: TransportArrivalEvent }) {
  const Icon = TRANSPORT_ICONS[event.transportType] ?? Navigation;
  const label = TRANSPORT_LABELS[event.transportType] ?? 'Transport';

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div>
        <p className="font-display font-bold text-xl leading-tight flex items-center gap-2">
          <Icon className="h-5 w-5 text-secondary shrink-0" />
          Arriving {event.arrivalLocation}
        </p>
        <p className="text-sm text-text-muted mt-0.5 flex items-center gap-1.5">
          <ArrowRight className="h-3.5 w-3.5" />
          {label} from {event.departureLocation}
        </p>
      </div>

      {event.time && (
        <p className="text-2xl font-bold text-text-base tabular-nums">{fmt12(event.time)}</p>
      )}

      {(event.vendor || event.bookingRef) && (
        <div className="flex items-center justify-between gap-4">
          {event.vendor && (
            <p className="text-sm text-text-muted">{event.vendor}</p>
          )}
          {event.bookingRef && (
            <p className="text-xs text-text-muted ml-auto">{event.bookingRef}</p>
          )}
        </div>
      )}
    </div>
  );
}

export function TransportCard({ event }: TransportCardProps) {
  if (event.subtype === 'departure') return <DepartureCard event={event as TransportDepartureEvent} />;
  return <ArrivalCard event={event as TransportArrivalEvent} />;
}
