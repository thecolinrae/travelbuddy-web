'use client';

import { useState } from 'react';
import { PlaneTakeoff, Bus, Train, Ship, Car, Navigation, ChevronDown } from 'lucide-react';
import { FlightCard } from '@/components/trip/day/FlightCard';
import { TransportCard } from '@/components/trip/day/TransportCard';
import type { LegWithEvents } from '@/services/legs';
import type {
  TimelineEvent,
  FlightDepartureEvent,
  FlightArrivalEvent,
  FlightConnectionEvent,
  TransportDepartureEvent,
  TransportArrivalEvent,
  TransportType,
} from '@/types';

const TRANSPORT_ICONS: Record<TransportType, React.ComponentType<{ className?: string }>> = {
  bus: Bus,
  train: Train,
  ferry: Ship,
  car_rental: Car,
  taxi: Car,
  rideshare: Car,
  other: Navigation,
};

function eventIcon(event: TimelineEvent) {
  if (event.type === 'flight') return PlaneTakeoff;
  if (event.type === 'otherTransportation') {
    return TRANSPORT_ICONS[event.transportType] ?? Navigation;
  }
  return Navigation;
}

function eventLabel(event: TimelineEvent): string {
  if (event.type === 'flight' && (event.subtype === 'departure' || event.subtype === 'arrival')) {
    return `${event.departureAirport} → ${event.arrivalAirport}`;
  }
  if (event.type === 'otherTransportation') {
    return `${event.departureLocation} → ${event.arrivalLocation}`;
  }
  return event.locationCity;
}

interface AssignDropdownProps {
  event: TimelineEvent;
  legOptions: LegWithEvents[];
  onAssign: (eventId: string, legId: string | null) => Promise<void>;
  tripId: string;
}

function AssignDropdown({ event, legOptions, onAssign, tripId }: AssignDropdownProps) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  async function handleAssignToLeg(legId: string) {
    setOpen(false);
    await onAssign(event.id, legId);
  }

  async function handleNewLeg() {
    setOpen(false);
    setCreating(true);
    try {
      const res = await fetch(`/api/trips/${tripId}/legs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) return;
      const data = await res.json() as { leg: { id: string } };
      await onAssign(event.id, data.leg.id);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={creating}
        className="flex items-center gap-1 text-xs text-text-muted hover:text-text-base border border-border rounded-md px-2 py-1 transition-colors bg-card"
      >
        {creating ? 'Assigning…' : 'Assign to leg'}
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute right-0 top-7 z-20 w-48 rounded-lg border bg-card shadow-md py-1 max-h-48 overflow-y-auto">
          {legOptions.map((leg) => (
            <button
              key={leg.id}
              onClick={() => handleAssignToLeg(leg.id)}
              className="w-full text-left px-3 py-2 text-sm text-text-base hover:bg-surface transition-colors truncate"
            >
              {leg.name ?? 'Unnamed leg'}
            </button>
          ))}
          <div className="border-t border-border mt-1 pt-1">
            <button
              onClick={handleNewLeg}
              className="w-full text-left px-3 py-2 text-sm text-text-muted hover:bg-surface transition-colors"
            >
              + New leg
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface Props {
  events: TimelineEvent[];
  legOptions: LegWithEvents[];
  isOwner: boolean;
  tripId: string;
  onAssign: (eventId: string, legId: string | null) => Promise<void>;
}

export function UnassignedSection({ events, legOptions, isOwner, tripId, onAssign }: Props) {
  if (events.length === 0) return null;

  return (
    <div className="space-y-3 pt-6">
      <p className="text-xs font-medium text-text-muted uppercase tracking-wide pb-2">
        Unassigned transport
      </p>
      {events.map((event) => {
        const Icon = eventIcon(event);
        return (
          <div key={event.id} className="space-y-2">
            {isOwner && (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Icon className="h-3.5 w-3.5 text-text-muted shrink-0" />
                  <span className="text-xs text-text-muted truncate">{eventLabel(event)}</span>
                </div>
                <AssignDropdown
                  event={event}
                  legOptions={legOptions}
                  onAssign={onAssign}
                  tripId={tripId}
                />
              </div>
            )}
            {event.type === 'flight' && (
              <FlightCard event={event as FlightDepartureEvent | FlightArrivalEvent | FlightConnectionEvent} />
            )}
            {event.type === 'otherTransportation' && (
              <TransportCard event={event as TransportDepartureEvent | TransportArrivalEvent} />
            )}
          </div>
        );
      })}
    </div>
  );
}
