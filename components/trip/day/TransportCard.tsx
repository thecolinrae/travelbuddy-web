'use client';

import { useState } from 'react';
import { Bus, Train, Ship, Car, Navigation, ArrowRight, Info } from 'lucide-react';
import { fmt12, fmtUtc, tzAbbr } from './utils';
import { EventDetailSheet } from './EventDetailSheet';
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

function InfoButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      aria-label="View details"
      onClick={onClick}
      className="shrink-0 text-text-muted hover:text-text-base transition-colors"
    >
      <Info className="h-4 w-4" />
    </button>
  );
}

function DepartureCard({ event }: { event: TransportDepartureEvent }) {
  const [open, setOpen] = useState(false);
  const Icon = TRANSPORT_ICONS[event.transportType] ?? Navigation;
  const label = TRANSPORT_LABELS[event.transportType] ?? 'Transport';

  return (
    <>
      <div className="rounded-xl border bg-card p-4 space-y-3">
        {/* Route */}
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold text-xl leading-tight">
              {event.departureLocation} → {event.arrivalLocation}
            </p>
            <p className="text-sm text-text-muted mt-0.5 flex items-center gap-1.5">
              <Icon className="h-3.5 w-3.5" />
              {label}
            </p>
          </div>
          <InfoButton onClick={() => setOpen(true)} />
        </div>

        {/* Time */}
        {event.time && (
          <div>
            <p className="text-2xl font-bold text-text-base tabular-nums">{fmt12(event.time)}</p>
            <p className="text-xs text-text-muted">
              {tzAbbr(event.timezone, event.date)}{event.utcISO ? ` · ${fmtUtc(event.utcISO)}` : ''}
            </p>
          </div>
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
      <EventDetailSheet open={open} onOpenChange={setOpen} event={event} />
    </>
  );
}

function ArrivalCard({ event }: { event: TransportArrivalEvent }) {
  const [open, setOpen] = useState(false);
  const Icon = TRANSPORT_ICONS[event.transportType] ?? Navigation;
  const label = TRANSPORT_LABELS[event.transportType] ?? 'Transport';

  return (
    <>
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold text-xl leading-tight flex items-center gap-2">
              <Icon className="h-5 w-5 text-secondary shrink-0" />
              Arriving {event.arrivalLocation}
            </p>
            <p className="text-sm text-text-muted mt-0.5 flex items-center gap-1.5">
              <ArrowRight className="h-3.5 w-3.5" />
              {label} from {event.departureLocation}
            </p>
          </div>
          <InfoButton onClick={() => setOpen(true)} />
        </div>

        {event.time && (
          <div>
            <p className="text-2xl font-bold text-text-base tabular-nums">{fmt12(event.time)}</p>
            <p className="text-xs text-text-muted">
              {tzAbbr(event.timezone, event.date)}{event.utcISO ? ` · ${fmtUtc(event.utcISO)}` : ''}
            </p>
          </div>
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
      <EventDetailSheet open={open} onOpenChange={setOpen} event={event} />
    </>
  );
}

export function TransportCard({ event }: TransportCardProps) {
  if (event.subtype === 'departure') return <DepartureCard event={event as TransportDepartureEvent} />;
  return <ArrivalCard event={event as TransportArrivalEvent} />;
}
