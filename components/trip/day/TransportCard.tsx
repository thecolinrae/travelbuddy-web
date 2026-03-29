import { Bus, Train, Ship, Car, Navigation } from 'lucide-react';
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

export function TransportCard({ event }: TransportCardProps) {
  const Icon = TRANSPORT_ICONS[event.transportType] ?? Navigation;
  const label = TRANSPORT_LABELS[event.transportType] ?? 'Transport';
  const isDeparture = event.subtype === 'departure';

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-muted/40 border-b flex items-center gap-2">
        <Icon className="h-4 w-4 text-secondary" />
        <span className="text-sm font-semibold text-text-base">
          {label}{!isDeparture && ' — Arriving'}
        </span>
        {event.vendor && (
          <span className="ml-auto text-xs text-text-muted">{event.vendor}</span>
        )}
      </div>

      <div className="px-4 py-3 space-y-1.5">
        {isDeparture ? (
          <>
            {/* Route */}
            <p className="text-sm font-medium text-text-base">
              {event.departureLocation} → {event.arrivalLocation}
            </p>
            {event.time && (
              <p className="text-sm tabular-nums text-text-muted">{fmt12(event.time)}</p>
            )}
          </>
        ) : (
          <>
            {/* Arrival */}
            <p className="text-sm font-medium text-text-base">{event.arrivalLocation}</p>
            {event.time && (
              <p className="text-sm tabular-nums text-text-muted">{fmt12(event.time)}</p>
            )}
            <p className="text-xs text-text-muted">From {event.departureLocation}</p>
          </>
        )}

        {/* Booking ref */}
        {event.bookingRef && (
          <p className="text-xs text-text-muted">Ref: {event.bookingRef}</p>
        )}
        {isDeparture && (event as TransportDepartureEvent).notes && (
          <p className="text-xs text-text-muted">{(event as TransportDepartureEvent).notes}</p>
        )}
      </div>
    </div>
  );
}
