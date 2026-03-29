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
    <div className="rounded-xl border bg-card p-4 space-y-2.5">
      {/* Route */}
      <p className="font-medium text-text-base">
        {isDeparture
          ? `${event.departureLocation} → ${event.arrivalLocation}`
          : `Arriving at ${event.arrivalLocation}`}
      </p>

      {/* Type + time row */}
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-text-muted flex items-center gap-1.5">
          <Icon className="h-4 w-4 text-secondary" />
          {label}
        </span>
        {event.time && (
          <span className="text-sm font-medium tabular-nums">{fmt12(event.time)}</span>
        )}
      </div>

      {/* Vendor */}
      {event.vendor && (
        <p className="text-sm text-text-muted">{event.vendor}</p>
      )}

      {/* Booking ref */}
      {event.bookingRef && (
        <p className="text-xs text-text-muted text-right">{event.bookingRef}</p>
      )}
    </div>
  );
}
