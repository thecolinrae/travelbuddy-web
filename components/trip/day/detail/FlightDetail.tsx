import {
  PlaneTakeoff, PlaneLanding, Clock, Hash, DoorOpen, Luggage,
  ArrowRight, ShieldAlert, Stamp, Armchair, Award, Globe,
} from 'lucide-react';
import { SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { SectionLabel, DetailRow, formatLayover, fmt12, fmtUtc, tzAbbr } from './shared';
import type { FlightDepartureEvent, FlightArrivalEvent, FlightConnectionEvent } from '@/types';

export function FlightDepartureDetail({ event }: { event: FlightDepartureEvent }) {
  const hasChips = event.travelClass || event.seatNumber || event.gate;
  const hasPassengers = event.passengers && event.passengers.length > 0;

  return (
    <>
      <SheetHeader className="shrink-0 pb-2">
        <SheetTitle className="font-display font-bold text-xl leading-tight">
          {event.departureAirport} → {event.arrivalAirport}
        </SheetTitle>
        <p className="text-sm text-text-muted flex items-center gap-1.5">
          <PlaneTakeoff className="h-3.5 w-3.5" />
          {event.flightNo}
          {event.locationCity && ` · ${event.locationCity}`}
        </p>
      </SheetHeader>

      <div className="flex-1 space-y-6 py-4">
        <div className="grid grid-cols-2 gap-3">
          <DetailRow icon={<Clock className="h-4 w-4" />} label="Departure" value={fmt12(event.time)} />
          {event.boardingTime && (
            <DetailRow icon={<Clock className="h-4 w-4" />} label="Board by" value={fmt12(event.boardingTime)} />
          )}
          {event.utcISO && (
            <DetailRow icon={<Globe className="h-4 w-4" />} label="UTC time" value={fmtUtc(event.utcISO)} />
          )}
          {event.timezone && (
            <DetailRow icon={<Globe className="h-4 w-4" />} label="Timezone" value={`${event.timezone} (${tzAbbr(event.timezone, event.date)})`} />
          )}
        </div>

        {hasChips && (
          <section className="space-y-2">
            <SectionLabel>Details</SectionLabel>
            <div className="grid grid-cols-2 gap-3">
              {event.travelClass && (
                <DetailRow icon={<Armchair className="h-4 w-4" />} label="Class" value={event.travelClass} />
              )}
              {event.seatNumber && (
                <DetailRow icon={<Hash className="h-4 w-4" />} label="Seat" value={event.seatNumber} />
              )}
              {event.gate && (
                <DetailRow icon={<DoorOpen className="h-4 w-4" />} label="Gate" value={event.gate} />
              )}
            </div>
          </section>
        )}

        {event.baggageAllowance && (
          <section className="space-y-1.5">
            <SectionLabel>Baggage</SectionLabel>
            <p className="text-sm text-text-base flex items-center gap-1.5 leading-relaxed">
              <Luggage className="h-4 w-4 text-text-muted shrink-0" />
              {event.baggageAllowance}
            </p>
          </section>
        )}

        {hasPassengers && (
          <section className="space-y-2">
            <SectionLabel>Passengers</SectionLabel>
            <ul className="space-y-1.5">
              {event.passengers!.map((p, i) => (
                <li key={i} className="rounded-xl border bg-card px-3 py-2.5 text-sm">
                  <p className="font-medium text-text-base">{p.name}</p>
                  {(p.seatNumber || p.mealChoice) && (
                    <p className="text-xs text-text-muted mt-0.5">
                      {[p.seatNumber && `Seat ${p.seatNumber}`, p.mealChoice].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {event.loyaltyStatus && (
          <p className="text-sm text-text-muted flex items-center gap-1.5">
            <Award className="h-4 w-4 shrink-0" />
            {event.loyaltyStatus}
            {event.loyaltyNo && ` · ${event.loyaltyNo}`}
          </p>
        )}

        {event.notes && (
          <section className="space-y-1.5">
            <SectionLabel>Notes</SectionLabel>
            <p className="text-sm text-text-muted leading-relaxed">{event.notes}</p>
          </section>
        )}

        {event.bookingRef && (
          <p className="text-xs text-text-muted">Booking ref: {event.bookingRef}</p>
        )}
      </div>
    </>
  );
}

export function FlightArrivalDetail({ event }: { event: FlightArrivalEvent }) {
  return (
    <>
      <SheetHeader className="shrink-0 pb-2">
        <SheetTitle className="font-display font-bold text-xl leading-tight flex items-center gap-2">
          <PlaneLanding className="h-5 w-5 text-secondary shrink-0" />
          Arriving {event.arrivalAirport}
        </SheetTitle>
        <p className="text-sm text-text-muted">{event.flightNo}</p>
      </SheetHeader>

      <div className="flex-1 space-y-6 py-4">
        <div className="grid grid-cols-2 gap-3">
          {event.time && (
            <DetailRow icon={<Clock className="h-4 w-4" />} label="Arrival time" value={fmt12(event.time)} />
          )}
          {event.utcISO && (
            <DetailRow icon={<Globe className="h-4 w-4" />} label="UTC time" value={fmtUtc(event.utcISO)} />
          )}
          {event.timezone && (
            <DetailRow icon={<Globe className="h-4 w-4" />} label="Timezone" value={`${event.timezone} (${tzAbbr(event.timezone, event.date)})`} />
          )}
        </div>
        {event.connectingFlight && (
          <p className="text-sm text-text-muted flex items-center gap-1.5">
            <ArrowRight className="h-4 w-4 shrink-0" />
            Connecting to {event.connectingFlight}
          </p>
        )}
        {event.bookingRef && (
          <p className="text-xs text-text-muted">Booking ref: {event.bookingRef}</p>
        )}
      </div>
    </>
  );
}

export function FlightConnectionDetail({ event }: { event: FlightConnectionEvent }) {
  const layover = formatLayover(event.layoverMinutes);
  const depTime = event.departureTime ?? event.time;

  return (
    <>
      <SheetHeader className="shrink-0 pb-2">
        <SheetTitle className="font-display font-bold text-xl leading-tight">
          Layover at {event.connectionAirport}
        </SheetTitle>
        {layover && <p className="text-sm text-text-muted">{layover} layover</p>}
      </SheetHeader>

      <div className="flex-1 space-y-6 py-4">
        {(event.requiresSecurity || event.requiresCustoms) && (
          <section className="space-y-2">
            <SectionLabel>Requirements</SectionLabel>
            <div className="flex flex-col gap-2">
              {event.requiresSecurity && (
                <Badge variant="outline" className="w-fit gap-1.5 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  Security required — allow 45–60 min
                </Badge>
              )}
              {event.requiresCustoms && (
                <Badge variant="outline" className="w-fit gap-1.5 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800">
                  <Stamp className="h-3.5 w-3.5" />
                  Customs required
                </Badge>
              )}
            </div>
          </section>
        )}

        <section className="space-y-2">
          <SectionLabel>Route</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            {event.inboundFromAirport && (
              <DetailRow icon={<PlaneLanding className="h-4 w-4" />} label="Arriving from" value={event.inboundFromAirport} />
            )}
            {event.outboundToAirport && (
              <DetailRow icon={<PlaneTakeoff className="h-4 w-4" />} label="Departing to" value={event.outboundToAirport} />
            )}
          </div>
        </section>

        {(event.outboundFlightNo || depTime) && (
          <p className="text-sm text-text-muted flex items-center gap-1.5">
            <PlaneTakeoff className="h-4 w-4 shrink-0" />
            {event.outboundFlightNo} departs {fmt12(depTime)}
          </p>
        )}

        {event.bookingRef && (
          <p className="text-xs text-text-muted">Booking ref: {event.bookingRef}</p>
        )}
      </div>
    </>
  );
}
