'use client';

import {
  PlaneTakeoff, PlaneLanding, Clock, Hash, DoorOpen, Luggage,
  ArrowRight, ShieldAlert, Stamp, Armchair, Users,
  LogIn, LogOut, Coffee, Award, MapPin,
  Bus, Train, Ship, Car, Navigation,
  DollarSign, Sun, Globe, Link2, Unlink, Loader2,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CategoryIcon } from '@/components/trip/activityIcons';
import { fmt12, fmtUtc, tzAbbr } from './utils';
import { MergeActivityModal } from './MergeActivityModal';
import { findMergeCandidates } from '@/services/activityMerge';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type {
  TimelineEvent,
  FlightDepartureEvent,
  FlightArrivalEvent,
  FlightConnectionEvent,
  HotelCheckInEvent,
  HotelCheckOutEvent,
  TransportDepartureEvent,
  TransportArrivalEvent,
  ActivityEvent,
  Activity,
  TransportType,
} from '@/types';

interface EventDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: TimelineEvent;
  // Optional — used for ActivityEvent link/unlink actions
  tripId?: string;
  activities?: Activity[];
  timeline?: ActivityEvent[];
  isOwner?: boolean;
  onActivityUpdate?: (updated: Activity[]) => void;
  linkedActivity?: Activity;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-medium text-text-muted uppercase tracking-wide">{children}</p>
  );
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-3 flex items-start gap-2">
      <span className="mt-0.5 shrink-0 text-text-muted">{icon}</span>
      <div>
        <p className="text-xs text-text-muted">{label}</p>
        <p className="text-sm text-text-base leading-snug">{value}</p>
      </div>
    </div>
  );
}

function formatLayover(minutes?: number): string {
  if (!minutes) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatShortDate(date: string): string {
  return new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const TRANSPORT_ICONS: Record<TransportType, React.ComponentType<{ className?: string }>> = {
  bus: Bus, train: Train, ferry: Ship,
  car_rental: Car, taxi: Car, rideshare: Car, other: Navigation,
};
const TRANSPORT_LABELS: Record<TransportType, string> = {
  bus: 'Bus', train: 'Train', ferry: 'Ferry',
  car_rental: 'Car rental', taxi: 'Taxi', rideshare: 'Rideshare', other: 'Transport',
};

// ─── Flight departure ─────────────────────────────────────────────────────────

function FlightDepartureDetail({ event }: { event: FlightDepartureEvent }) {
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
        {/* Times */}
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

        {/* Seat / class / gate */}
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

        {/* Baggage */}
        {event.baggageAllowance && (
          <section className="space-y-1.5">
            <SectionLabel>Baggage</SectionLabel>
            <p className="text-sm text-text-base flex items-center gap-1.5 leading-relaxed">
              <Luggage className="h-4 w-4 text-text-muted shrink-0" />
              {event.baggageAllowance}
            </p>
          </section>
        )}

        {/* Passengers */}
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

        {/* Loyalty */}
        {event.loyaltyStatus && (
          <p className="text-sm text-text-muted flex items-center gap-1.5">
            <Award className="h-4 w-4 shrink-0" />
            {event.loyaltyStatus}
            {event.loyaltyNo && ` · ${event.loyaltyNo}`}
          </p>
        )}

        {/* Notes */}
        {event.notes && (
          <section className="space-y-1.5">
            <SectionLabel>Notes</SectionLabel>
            <p className="text-sm text-text-muted leading-relaxed">{event.notes}</p>
          </section>
        )}

        {/* Booking ref */}
        {event.bookingRef && (
          <p className="text-xs text-text-muted">Booking ref: {event.bookingRef}</p>
        )}
      </div>
    </>
  );
}

// ─── Flight arrival ───────────────────────────────────────────────────────────

function FlightArrivalDetail({ event }: { event: FlightArrivalEvent }) {
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

// ─── Flight connection ────────────────────────────────────────────────────────

function FlightConnectionDetail({ event }: { event: FlightConnectionEvent }) {
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
        {/* Warnings */}
        {(event.requiresSecurity || event.requiresCustoms) && (
          <section className="space-y-2">
            <SectionLabel>Requirements</SectionLabel>
            <div className="flex flex-col gap-2">
              {event.requiresSecurity && (
                <Badge
                  variant="outline"
                  className="w-fit gap-1.5 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800"
                >
                  <ShieldAlert className="h-3.5 w-3.5" />
                  Security required — allow 45–60 min
                </Badge>
              )}
              {event.requiresCustoms && (
                <Badge
                  variant="outline"
                  className="w-fit gap-1.5 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800"
                >
                  <Stamp className="h-3.5 w-3.5" />
                  Customs required
                </Badge>
              )}
            </div>
          </section>
        )}

        {/* Route */}
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

        {/* Next departure */}
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

// ─── Hotel check-in ───────────────────────────────────────────────────────────

function HotelCheckInDetail({ event }: { event: HotelCheckInEvent }) {
  return (
    <>
      <SheetHeader className="shrink-0 pb-2">
        <SheetTitle className="font-display font-semibold text-xl leading-snug">
          {event.hotelName}
        </SheetTitle>
        {event.locationAddress && (
          <p className="text-sm text-text-muted flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            {event.locationAddress}
          </p>
        )}
      </SheetHeader>

      <div className="flex-1 space-y-6 py-4">
        {/* Check-in / check-out */}
        <section className="space-y-2">
          <SectionLabel>Stay</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            <DetailRow
              icon={<LogIn className="h-4 w-4" />}
              label="Check in from"
              value={fmt12(event.time) || '3:00 PM'}
            />
            {event.checkoutDate && (
              <DetailRow
                icon={<LogOut className="h-4 w-4" />}
                label={`Check out · ${formatShortDate(event.checkoutDate)}`}
                value={event.checkoutTime ? fmt12(event.checkoutTime) : '11:00 AM'}
              />
            )}
            {event.roomType && (
              <DetailRow icon={<Hash className="h-4 w-4" />} label="Room type" value={event.roomType} />
            )}
            {event.numberOfNights && (
              <DetailRow
                icon={<Clock className="h-4 w-4" />}
                label="Duration"
                value={`${event.numberOfNights} night${event.numberOfNights > 1 ? 's' : ''}`}
              />
            )}
          </div>
        </section>

        {/* Breakfast */}
        {event.breakfastIncluded && (
          <div className="flex items-center gap-2 text-sm text-text-base">
            <Coffee className="h-4 w-4 text-text-muted shrink-0" />
            Breakfast included
          </div>
        )}

        {/* All amenities */}
        {event.amenities.length > 0 && (
          <section className="space-y-2">
            <SectionLabel>Amenities</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {event.amenities.map((a) => (
                <Badge key={a} variant="outline" className="text-xs font-normal">{a}</Badge>
              ))}
            </div>
          </section>
        )}

        {/* Loyalty */}
        {event.loyaltyStatus && (
          <p className="text-sm text-text-muted flex items-center gap-1.5">
            <Award className="h-4 w-4 shrink-0" />
            {event.loyaltyStatus}
            {event.loyaltyNumber && ` · ${event.loyaltyNumber}`}
          </p>
        )}

        {/* Notes */}
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

// ─── Hotel check-out ──────────────────────────────────────────────────────────

function HotelCheckOutDetail({ event }: { event: HotelCheckOutEvent }) {
  return (
    <>
      <SheetHeader className="shrink-0 pb-2">
        <SheetTitle className="font-display font-semibold text-xl leading-snug">
          {event.hotelName}
        </SheetTitle>
      </SheetHeader>
      <div className="flex-1 space-y-4 py-4">
        {event.time && (
          <DetailRow icon={<LogOut className="h-4 w-4" />} label="Check out by" value={fmt12(event.time)} />
        )}
        {event.bookingRef && (
          <p className="text-xs text-text-muted">Booking ref: {event.bookingRef}</p>
        )}
      </div>
    </>
  );
}

// ─── Transport ────────────────────────────────────────────────────────────────

function TransportDetail({ event }: { event: TransportDepartureEvent | TransportArrivalEvent }) {
  const Icon = TRANSPORT_ICONS[event.transportType] ?? Navigation;
  const label = TRANSPORT_LABELS[event.transportType] ?? 'Transport';
  const isDep = event.subtype === 'departure';
  const dep = event as TransportDepartureEvent;

  return (
    <>
      <SheetHeader className="shrink-0 pb-2">
        <SheetTitle className="font-display font-bold text-xl leading-tight">
          {isDep ? `${dep.departureLocation} → ${dep.arrivalLocation}` : `Arriving ${event.arrivalLocation}`}
        </SheetTitle>
        <p className="text-sm text-text-muted flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5" />
          {label}
          {!isDep && ` from ${event.departureLocation}`}
        </p>
      </SheetHeader>

      <div className="flex-1 space-y-6 py-4">
        <div className="grid grid-cols-2 gap-3">
          {event.time && (
            <DetailRow
              icon={<Clock className="h-4 w-4" />}
              label={isDep ? 'Departure' : 'Arrival'}
              value={fmt12(event.time)}
            />
          )}
          {event.utcISO && (
            <DetailRow icon={<Globe className="h-4 w-4" />} label="UTC time" value={fmtUtc(event.utcISO)} />
          )}
          {event.timezone && (
            <DetailRow icon={<Globe className="h-4 w-4" />} label="Timezone" value={`${event.timezone} (${tzAbbr(event.timezone, event.date)})`} />
          )}
        </div>
        {event.vendor && (
          <p className="text-sm text-text-base flex items-center gap-1.5">
            <Users className="h-4 w-4 text-text-muted shrink-0" />
            {event.vendor}
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

// ─── Activity event (confirmed booking) ──────────────────────────────────────

interface ActivityEventDetailProps {
  event: ActivityEvent;
  tripId?: string;
  activities?: Activity[];
  timeline?: ActivityEvent[];
  isOwner?: boolean;
  onActivityUpdate?: (updated: Activity[]) => void;
  linkedActivity?: Activity;
}

function ActivityEventDetail({
  event,
  tripId,
  activities,
  timeline,
  isOwner,
  onActivityUpdate,
  linkedActivity,
}: ActivityEventDetailProps) {
  const router = useRouter();
  const [mergeOpen, setMergeOpen] = useState(false);
  const [unlinking, setUnlinking] = useState(false);

  // Enrichment fallback: use linked activity data when event lacks it
  const tips = event.tips || linkedActivity?.tips;
  const highlights = event.highlights?.length ? event.highlights : linkedActivity?.highlights;
  const hasDetails = event.estimatedCost || event.duration || event.bestTime || event.locationAddress;

  // Candidates for linking (shown as "Link to planned activity" button)
  const candidateActivities =
    isOwner && !event.linkedActivityId && activities && timeline
      ? findMergeCandidates(activities, [event]).map((c) => c.activity)
      : [];

  async function handleUnlink() {
    if (!event.linkedActivityId || !tripId) return;
    setUnlinking(true);
    try {
      await fetch(`/api/trips/${tripId}/activities/merge`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activityId: event.linkedActivityId, eventId: event.id }),
      });
      if (activities && onActivityUpdate) {
        onActivityUpdate(
          activities.map((a) =>
            a.id === event.linkedActivityId ? { ...a, linkedEventId: undefined } : a,
          ),
        );
      }
      router.refresh();
    } finally {
      setUnlinking(false);
    }
  }

  return (
    <>
      <SheetHeader className="shrink-0 pb-2">
        <SheetTitle className="font-display font-semibold text-xl leading-snug">
          {event.description}
        </SheetTitle>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <CategoryIcon type={event.category} />
          <Badge variant="outline" className="capitalize font-normal text-xs">{event.category}</Badge>
          {event.locationCity && <span className="type-caption">{event.locationCity}</span>}
        </div>
      </SheetHeader>

      <div className="flex-1 space-y-6 py-4">
        {hasDetails && (
          <section className="space-y-2">
            <SectionLabel>Details</SectionLabel>
            <div className="grid grid-cols-2 gap-3">
              {event.estimatedCost && (
                <DetailRow icon={<DollarSign className="h-4 w-4" />} label="Estimated cost" value={event.estimatedCost} />
              )}
              {event.duration && (
                <DetailRow icon={<Clock className="h-4 w-4" />} label="Duration" value={event.duration} />
              )}
              {event.bestTime && (
                <DetailRow icon={<Sun className="h-4 w-4" />} label="Best time" value={event.bestTime} />
              )}
              {event.locationAddress && (
                <DetailRow icon={<MapPin className="h-4 w-4" />} label="Address" value={event.locationAddress} />
              )}
            </div>
          </section>
        )}

        {tips && (
          <section className="space-y-1.5">
            <SectionLabel>Tips</SectionLabel>
            <p className="text-sm text-text-muted leading-relaxed italic">{tips}</p>
          </section>
        )}

        {highlights && highlights.length > 0 && (
          <section className="space-y-2">
            <SectionLabel>Highlights</SectionLabel>
            <ul className="space-y-1.5">
              {highlights.map((h, i) => (
                <li key={i} className="flex items-start gap-1.5 text-sm text-text-muted">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-text-muted shrink-0" />
                  <span className="leading-relaxed">{h}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {event.bookingRef && (
          <p className="text-xs text-text-muted">Booking ref: {event.bookingRef}</p>
        )}

        {/* Linked activity — shows when merged */}
        {isOwner && event.linkedActivityId && linkedActivity && (
          <section className="space-y-2">
            <SectionLabel>Planning notes</SectionLabel>
            <div className="rounded-xl border bg-card px-3 py-2.5 flex items-center gap-2">
              <CategoryIcon type={linkedActivity.type} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-base leading-snug truncate">{linkedActivity.name}</p>
                <p className="text-xs text-text-muted">Planned activity</p>
              </div>
              <button
                onClick={handleUnlink}
                disabled={unlinking}
                className="text-xs text-text-muted hover:text-destructive transition-colors flex items-center gap-1 shrink-0"
              >
                {unlinking
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Unlink className="h-3.5 w-3.5" />
                }
                Unlink
              </button>
            </div>
          </section>
        )}
      </div>

      {/* Link to planned activity */}
      {isOwner && !event.linkedActivityId && candidateActivities.length > 0 && tripId && (
        <div className="shrink-0 border-t pt-4">
          <Button variant="outline" onClick={() => setMergeOpen(true)} className="w-full gap-2">
            <Link2 className="h-4 w-4" />
            Link to planned activity
          </Button>
        </div>
      )}

      {mergeOpen && candidateActivities[0] && tripId && (
        <MergeActivityModal
          open={mergeOpen}
          onOpenChange={setMergeOpen}
          tripId={tripId}
          activity={candidateActivities[0]}
          event={event}
          onMerged={() => router.refresh()}
        />
      )}
    </>
  );
}

// ─── Root sheet ───────────────────────────────────────────────────────────────

export function EventDetailSheet({
  open,
  onOpenChange,
  event,
  tripId,
  activities,
  timeline,
  isOwner,
  onActivityUpdate,
  linkedActivity,
}: EventDetailSheetProps) {
  function renderContent() {
    if (event.type === 'flight') {
      if (event.subtype === 'departure') return <FlightDepartureDetail event={event} />;
      if (event.subtype === 'arrival') return <FlightArrivalDetail event={event} />;
      return <FlightConnectionDetail event={event} />;
    }
    if (event.type === 'hotel') {
      if (event.subtype === 'check_in') return <HotelCheckInDetail event={event} />;
      return <HotelCheckOutDetail event={event} />;
    }
    if (event.type === 'otherTransportation') {
      return <TransportDetail event={event as TransportDepartureEvent | TransportArrivalEvent} />;
    }
    if (event.type === 'activity') {
      return (
        <ActivityEventDetail
          event={event}
          tripId={tripId}
          activities={activities}
          timeline={timeline}
          isOwner={isOwner}
          onActivityUpdate={onActivityUpdate}
          linkedActivity={linkedActivity}
        />
      );
    }
    return null;
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col w-full sm:max-w-md overflow-y-auto">
        {renderContent()}
      </SheetContent>
    </Sheet>
  );
}
