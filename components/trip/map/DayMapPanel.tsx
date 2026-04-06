'use client';

import { TripMapCanvas } from './TripMapCanvas';
import type { Waypoint } from './mapLoader';
import type { DayItem } from '@/components/trip/day/utils';
import type {
  HotelCheckInEvent,
  FlightDepartureEvent,
  FlightArrivalEvent,
  FlightConnectionEvent,
  TransportDepartureEvent,
  TransportArrivalEvent,
  ActivityEvent,
} from '@/types';

interface Props {
  items: DayItem[];
  selectedId?: string;
  onSelect?: (id: string | null) => void;
}

function deriveWaypoints(items: DayItem[]): Waypoint[] {
  const waypoints: Waypoint[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    if (item.kind === 'now') continue;

    let wp: Waypoint | null = null;

    if (item.kind === 'activity') {
      const a = item.activity;
      const label = a.name;
      if (a.latitude != null && a.longitude != null) {
        wp = { label, query: label, position: { lat: a.latitude, lng: a.longitude }, id: a.id, detail: a.address ?? undefined };
      } else {
        const q = a.address ? `${a.address}, ${a.city ?? ''}` : (a.city ?? '');
        if (q.trim()) wp = { label, query: q, id: a.id, detail: a.address ?? undefined };
      }
    } else {
      const e = item.event;
      if (e.type === 'hotel' && e.subtype === 'check_in') {
        const ev = e as HotelCheckInEvent;
        wp = {
          label: ev.hotelName,
          query: ev.locationAddress
            ? `${ev.hotelName}, ${ev.locationAddress}`
            : `${ev.hotelName}, ${ev.locationCity}`,
          id: e.id,
          detail: ev.locationAddress ?? undefined,
        };
      } else if (e.type === 'flight') {
        const ev = e as FlightDepartureEvent | FlightArrivalEvent | FlightConnectionEvent;
        if (ev.subtype === 'departure') {
          wp = { label: (ev as FlightDepartureEvent).departureAirport, query: (ev as FlightDepartureEvent).departureAirport, id: e.id };
        } else if (ev.subtype === 'arrival') {
          wp = { label: (ev as FlightArrivalEvent).arrivalAirport, query: (ev as FlightArrivalEvent).arrivalAirport, id: e.id };
        }
        // connection events: no single clean location to pin
      } else if (e.type === 'otherTransportation' && e.subtype === 'departure') {
        const ev = e as TransportDepartureEvent;
        wp = { label: ev.departureLocation, query: ev.departureLocation, id: e.id };
      } else if (e.type === 'otherTransportation' && e.subtype === 'arrival') {
        const ev = e as TransportArrivalEvent;
        wp = { label: ev.arrivalLocation, query: ev.arrivalLocation, id: e.id };
      } else if (e.type === 'activity') {
        const ev = e as ActivityEvent;
        const q = ev.locationAddress
          ? `${ev.locationAddress}, ${ev.locationCity}`
          : ev.locationCity;
        wp = { label: ev.description, query: q, id: e.id, detail: ev.locationAddress ?? undefined };
      }
    }

    if (wp && !seen.has(wp.label)) {
      seen.add(wp.label);
      waypoints.push(wp);
    }
  }

  return waypoints;
}

export function DayMapPanel({ items, selectedId, onSelect }: Props) {
  const waypoints = deriveWaypoints(items);
  if (waypoints.length === 0) return null;

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <TripMapCanvas waypoints={waypoints} height={240} selectedId={selectedId} onSelect={onSelect} />
    </div>
  );
}
