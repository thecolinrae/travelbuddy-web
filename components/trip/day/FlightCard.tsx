'use client';

import { useState } from 'react';
import {
  PlaneTakeoff, PlaneLanding, Clock, Hash, DoorOpen, Luggage,
  ArrowRight, ShieldAlert, Stamp, Armchair, Info,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { fmt12 } from './utils';
import { EventDetailSheet } from './EventDetailSheet';
import type { FlightDepartureEvent, FlightArrivalEvent, FlightConnectionEvent } from '@/types';

type FlightEvent = FlightDepartureEvent | FlightArrivalEvent | FlightConnectionEvent;

interface FlightCardProps {
  event: FlightEvent;
}

function formatLayover(minutes?: number): string {
  if (!minutes) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

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

function DeparturCard({ event }: { event: FlightDepartureEvent }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="rounded-xl border bg-card p-4 space-y-3">
        {/* Route + flight number */}
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold text-xl leading-tight">
              {event.departureAirport} → {event.arrivalAirport}
            </p>
            <p className="text-sm text-text-muted mt-0.5 flex items-center gap-1.5">
              <PlaneTakeoff className="h-3.5 w-3.5" />
              {event.flightNo}
            </p>
          </div>
          <InfoButton onClick={() => setOpen(true)} />
        </div>

        {/* Departure time + boarding */}
        <div className="flex items-end justify-between gap-4">
          <p className="text-2xl font-bold text-text-base tabular-nums">
            {fmt12(event.time)}
          </p>
          {event.boardingTime && (
            <p className="text-sm text-text-muted flex items-center gap-1.5 pb-0.5">
              <Clock className="h-4 w-4" />
              Board by {fmt12(event.boardingTime)}
            </p>
          )}
        </div>

        {/* Detail chips */}
        {(event.travelClass || event.seatNumber || event.gate) && (
          <div className="flex flex-wrap gap-2">
            {event.travelClass && (
              <span className="inline-flex items-center gap-1 text-xs text-text-muted">
                <Armchair className="h-3.5 w-3.5" />
                {event.travelClass}
              </span>
            )}
            {event.seatNumber && (
              <span className="inline-flex items-center gap-1 text-xs text-text-muted">
                <Hash className="h-3.5 w-3.5" />
                Seat {event.seatNumber}
              </span>
            )}
            {event.gate && (
              <span className="inline-flex items-center gap-1 text-xs text-text-muted">
                <DoorOpen className="h-3.5 w-3.5" />
                Gate {event.gate}
              </span>
            )}
          </div>
        )}

        {/* Baggage */}
        {event.baggageAllowance && (
          <p className="text-sm text-text-muted flex items-center gap-1.5">
            <Luggage className="h-4 w-4" />
            {event.baggageAllowance}
          </p>
        )}

        {/* Booking ref */}
        {event.bookingRef && (
          <p className="text-xs text-text-muted text-right">{event.bookingRef}</p>
        )}
      </div>
      <EventDetailSheet open={open} onOpenChange={setOpen} event={event} />
    </>
  );
}

function ArrivalCard({ event }: { event: FlightArrivalEvent }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold text-xl leading-tight flex items-center gap-2">
              <PlaneLanding className="h-5 w-5 text-secondary shrink-0" />
              Arriving {event.arrivalAirport}
            </p>
            <p className="text-sm text-text-muted mt-0.5">{event.flightNo}</p>
          </div>
          <InfoButton onClick={() => setOpen(true)} />
        </div>

        {event.time && (
          <p className="text-2xl font-bold text-text-base tabular-nums">{fmt12(event.time)}</p>
        )}

        {event.connectingFlight && (
          <p className="text-sm text-text-muted flex items-center gap-1.5">
            <ArrowRight className="h-4 w-4" />
            Connecting to {event.connectingFlight}
          </p>
        )}

        {event.bookingRef && (
          <p className="text-xs text-text-muted text-right">{event.bookingRef}</p>
        )}
      </div>
      <EventDetailSheet open={open} onOpenChange={setOpen} event={event} />
    </>
  );
}

function ConnectionCard({ event }: { event: FlightConnectionEvent }) {
  const [open, setOpen] = useState(false);
  const layover = formatLayover(event.layoverMinutes);
  const depTime = event.departureTime ?? event.time;

  return (
    <>
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold text-xl leading-tight flex items-center gap-2">
              <Clock className="h-5 w-5 text-text-muted shrink-0" />
              Layover at {event.connectionAirport}
            </p>
            {layover && (
              <p className="text-sm text-text-muted mt-0.5">{layover} layover</p>
            )}
          </div>
          <InfoButton onClick={() => setOpen(true)} />
        </div>

        {/* Warning badges */}
        {(event.requiresSecurity || event.requiresCustoms) && (
          <div className="flex flex-wrap gap-2">
            {event.requiresSecurity && (
              <Badge
                variant="outline"
                className="gap-1 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800"
              >
                <ShieldAlert className="h-3.5 w-3.5" />
                Security required
              </Badge>
            )}
            {event.requiresCustoms && (
              <Badge
                variant="outline"
                className="gap-1 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800"
              >
                <Stamp className="h-3.5 w-3.5" />
                Customs required
              </Badge>
            )}
          </div>
        )}

        {event.requiresSecurity && (
          <p className="text-xs text-text-muted italic">Allow 45–60 min for security</p>
        )}

        {/* Next departure */}
        {(event.outboundFlightNo || depTime) && (
          <p className="text-sm text-text-muted flex items-center gap-1.5">
            <PlaneTakeoff className="h-4 w-4" />
            {event.outboundFlightNo} departs {fmt12(depTime)}
          </p>
        )}
      </div>
      <EventDetailSheet open={open} onOpenChange={setOpen} event={event} />
    </>
  );
}

export function FlightCard({ event }: FlightCardProps) {
  if (event.subtype === 'departure') return <DeparturCard event={event} />;
  if (event.subtype === 'arrival') return <ArrivalCard event={event} />;
  return <ConnectionCard event={event} />;
}
