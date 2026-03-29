'use client';

import type { FlightDepartureEvent, FlightArrivalEvent, TimelineEvent } from '@/types';

function fmt12(time?: string): string {
  if (!time) return '—';
  const [hStr, mStr] = time.split(':');
  const h = parseInt(hStr, 10);
  const m = mStr ?? '00';
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h >= 12 ? 'PM' : 'AM'}`;
}

function formatDate(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

type FlightEvent = FlightDepartureEvent | FlightArrivalEvent;

interface Journey {
  id: string;
  events: FlightEvent[];
}

interface Props {
  timeline: TimelineEvent[];
}

export function FlightsTab({ timeline }: Props) {
  const flightEvents = timeline.filter(
    (e): e is FlightEvent =>
      e.type === 'flight' && (e.subtype === 'departure' || e.subtype === 'arrival'),
  );

  if (flightEvents.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground text-sm">
        No flights found.
      </div>
    );
  }

  // Group into journeys by journeyId, then handle solo flights
  const journeyMap = new Map<string, FlightEvent[]>();
  const soloFlights: FlightEvent[] = [];

  for (const e of flightEvents) {
    if (e.journeyId) {
      const j = journeyMap.get(e.journeyId) ?? [];
      j.push(e);
      journeyMap.set(e.journeyId, j);
    } else {
      soloFlights.push(e);
    }
  }

  const journeys: Journey[] = [
    ...[...journeyMap.entries()].map(([id, events]) => ({ id, events })),
    ...soloFlights.map((e) => ({ id: e.id, events: [e] })),
  ];

  // Sort journeys by earliest event date
  journeys.sort((a, b) => {
    const aDate = a.events[0]?.date ?? '';
    const bDate = b.events[0]?.date ?? '';
    return aDate.localeCompare(bDate);
  });

  return (
    <div className="space-y-4">
      {journeys.map((journey) => {
        const departures = journey.events.filter(
          (e): e is FlightDepartureEvent => e.subtype === 'departure',
        );
        const arrivals = journey.events.filter(
          (e): e is FlightArrivalEvent => e.subtype === 'arrival',
        );

        const firstDep = departures[0];
        const lastArr = arrivals[arrivals.length - 1];
        const isMultiLeg = departures.length > 1;

        if (!firstDep) return null;

        return (
          <div key={journey.id} className="rounded-xl border bg-card overflow-hidden">
            {/* Journey header */}
            <div className="px-4 py-3 bg-muted/40 border-b flex items-center gap-2">
              <span className="text-base">✈️</span>
              <span className="text-sm font-semibold">
                {firstDep.departureAirport} → {lastArr?.arrivalAirport ?? departures[departures.length - 1]?.arrivalAirport}
              </span>
              {isMultiLeg && (
                <span className="ml-auto text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                  {departures.length} legs
                </span>
              )}
            </div>

            {/* Each departure leg */}
            <div className="divide-y">
              {departures.map((dep, i) => {
                const arr = arrivals[i];
                return (
                  <div key={dep.id} className="px-4 py-3 space-y-1.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium text-sm">{dep.flightNo}</span>
                      {dep.travelClass && (
                        <span className="text-xs text-muted-foreground">{dep.travelClass}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <div className="text-center min-w-[60px]">
                        <p className="font-semibold">{fmt12(dep.time)}</p>
                        <p className="text-xs text-muted-foreground">{dep.departureAirport}</p>
                      </div>
                      <div className="flex-1 border-t border-dashed border-muted-foreground/40 relative">
                        <span className="absolute left-1/2 -translate-x-1/2 -top-2 text-xs text-muted-foreground bg-card px-1">
                          ✈
                        </span>
                      </div>
                      <div className="text-center min-w-[60px]">
                        <p className="font-semibold">{arr ? fmt12(arr.time) : '—'}</p>
                        <p className="text-xs text-muted-foreground">{arr?.arrivalAirport ?? dep.arrivalAirport}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      <span className="text-xs text-muted-foreground">📅 {formatDate(dep.date)}</span>
                      {dep.seatNumber && (
                        <span className="text-xs text-muted-foreground">💺 Seat {dep.seatNumber}</span>
                      )}
                      {dep.gate && (
                        <span className="text-xs text-muted-foreground">🚪 Gate {dep.gate}</span>
                      )}
                      {dep.boardingTime && (
                        <span className="text-xs text-muted-foreground">⏰ Boarding {fmt12(dep.boardingTime)}</span>
                      )}
                      {dep.baggageAllowance && (
                        <span className="text-xs text-muted-foreground">🧳 {dep.baggageAllowance}</span>
                      )}
                      {dep.bookingRef && (
                        <span className="text-xs text-muted-foreground">🎫 {dep.bookingRef}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
