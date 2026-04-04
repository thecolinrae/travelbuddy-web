'use client';

import { ChevronRight } from 'lucide-react';
import { TripMapCanvas } from './TripMapCanvas';
import type { Waypoint } from './mapLoader';
import type { LegWithEvents } from '@/services/legs';
import type { TimelineEvent } from '@/types';

interface Props {
  legs: LegWithEvents[];
}

function eventOrigin(e: TimelineEvent): string {
  if (e.type === 'flight') {
    if (e.subtype === 'connection') return e.inboundFromAirport;
    return e.departureAirport;
  }
  if (e.type === 'otherTransportation') return e.departureLocation;
  return e.locationCity;
}

function eventDestination(e: TimelineEvent): string {
  if (e.type === 'flight') {
    if (e.subtype === 'connection') return e.outboundToAirport;
    return e.arrivalAirport;
  }
  if (e.type === 'otherTransportation') return e.arrivalLocation;
  return e.locationCity;
}

function legEarliestUtc(leg: LegWithEvents): string {
  return leg.events
    .map((e) => e.utcISO ?? e.date ?? '')
    .filter(Boolean)
    .sort()[0] ?? '';
}

function deriveWaypoints(legs: LegWithEvents[]): Waypoint[] {
  const sorted = [...legs].sort((a, b) =>
    legEarliestUtc(a).localeCompare(legEarliestUtc(b)),
  );
  const waypoints: Waypoint[] = [];

  for (const leg of sorted) {
    const transport = leg.events
      .filter((e) => e.type === 'flight' || e.type === 'otherTransportation')
      .sort((a, b) => (a.utcISO ?? a.date ?? '').localeCompare(b.utcISO ?? b.date ?? ''));
    if (transport.length === 0) continue;

    const first = transport[0];
    const last = transport[transport.length - 1];
    const origin = eventOrigin(first);
    const destination = eventDestination(last);

    // Push origin if not a duplicate of the previous tail
    const tail = waypoints[waypoints.length - 1];
    if (!tail || tail.label !== origin) {
      waypoints.push({ label: origin, query: origin });
    }
    // Push destination if not same as what we just pushed
    const newTail = waypoints[waypoints.length - 1];
    if (newTail.label !== destination) {
      waypoints.push({ label: destination, query: destination });
    }
  }

  return waypoints;
}

export function TransportRouteMap({ legs }: Props) {
  const waypoints = deriveWaypoints(legs);
  if (waypoints.length === 0) return null;

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <TripMapCanvas waypoints={waypoints} height={280} />
      {/* Route legend */}
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 px-4 py-3 border-t">
        {waypoints.map((wp, i) => (
          <div key={i} className="flex items-center gap-1.5">
            {i > 0 && (
              <ChevronRight className="h-3 w-3 text-text-muted shrink-0" />
            )}
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">
                {i + 1}
              </span>
              <span className="text-xs text-text-base">{wp.label}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
