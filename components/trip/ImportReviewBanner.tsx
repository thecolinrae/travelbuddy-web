'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, X, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EventFormModal } from './EventFormModal';
import type { ImportWarning, TimelineEvent } from '@/types';

interface Props {
  warnings: ImportWarning[];
  reviewedIds: Set<string>;
  timeline: TimelineEvent[];
  tripId: string;
  onEventReviewed: (eventId: string) => void;
  onDismiss: () => void;
}

function eventHeadline(event: TimelineEvent): string {
  switch (event.type) {
    case 'flight':
      if (event.subtype === 'departure' || event.subtype === 'arrival') {
        return `${event.flightNo}: ${event.departureAirport} → ${event.arrivalAirport}`;
      }
      if (event.subtype === 'connection') return `Connection at ${event.connectionAirport}`;
      return 'Flight';
    case 'hotel':
      return event.subtype === 'check_in' ? `Check in — ${event.hotelName}` : `Check out — ${event.hotelName}`;
    case 'otherTransportation': {
      const label =
        event.transportType === 'bus' ? 'Bus'
        : event.transportType === 'train' ? 'Train'
        : event.transportType === 'ferry' ? 'Ferry'
        : event.transportType === 'car_rental' ? 'Car rental'
        : event.transportType === 'taxi' ? 'Taxi'
        : event.transportType === 'rideshare' ? 'Rideshare'
        : 'Transport';
      return `${label}: ${event.departureLocation} → ${event.arrivalLocation}`;
    }
    case 'activity':
      return event.description;
    case 'expense':
      return event.description;
    default:
      return 'Event';
  }
}

function warningDescription(code: ImportWarning['code']): string {
  switch (code) {
    case 'flight_time_inversion': return 'Arrival appears before departure — check the date';
    case 'transport_type_unknown': return 'Transport type could not be identified';
    case 'uncertain_field': return 'Some details were inferred, not explicitly stated';
  }
}

export function ImportReviewBanner({
  warnings,
  reviewedIds,
  timeline,
  tripId,
  onEventReviewed,
  onDismiss,
}: Props) {
  const router = useRouter();
  const [fixingEventId, setFixingEventId] = useState<string | null>(null);

  const pendingCount = warnings.length - reviewedIds.size;
  if (pendingCount <= 0) return null;

  const eventById = new Map(timeline.map((e) => [e.id, e]));

  return (
    <>
      <div className="mx-4 mt-4 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-950/30 overflow-hidden">
        {/* Header */}
        <div className="flex items-start gap-3 px-4 py-3 border-b border-amber-200 dark:border-amber-800/50">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              {pendingCount === 1
                ? '1 item from your import needs attention'
                : `${pendingCount} items from your import need attention`}
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed mt-0.5">
              Review these events to make sure everything looks right.
            </p>
          </div>
          <button
            aria-label="Dismiss"
            onClick={onDismiss}
            className="shrink-0 text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-200 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Warning rows */}
        <div className="divide-y divide-amber-100 dark:divide-amber-800/40">
          {warnings.map((warning) => {
            const event = eventById.get(warning.eventId);
            const reviewed = reviewedIds.has(warning.eventId);

            return (
              <div
                key={warning.eventId}
                className={[
                  'flex items-center gap-3 px-4 py-3 transition-colors',
                  reviewed ? 'opacity-50' : '',
                ].join(' ')}
              >
                {reviewed ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                ) : (
                  <div className="h-4 w-4 shrink-0 flex items-center justify-center">
                    <div className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-amber-900 dark:text-amber-200 truncate">
                    {event ? eventHeadline(event) : 'Unknown event'}
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                    {warningDescription(warning.code)}
                    {warning.fields?.length
                      ? ` — ${warning.fields.join(', ')}`
                      : ''}
                  </p>
                </div>

                {!reviewed && event && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setFixingEventId(event.id)}
                    className="shrink-0 gap-1.5 h-7 text-xs border-amber-300 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/40"
                  >
                    <Wrench className="h-3 w-3" />
                    Fix
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* EventFormModal for the selected event */}
      {fixingEventId && (() => {
        const event = eventById.get(fixingEventId);
        if (!event) return null;
        return (
          <EventFormModal
            tripId={tripId}
            open={true}
            editing={event}
            onClose={() => setFixingEventId(null)}
            onSaved={() => {
              onEventReviewed(fixingEventId);
              setFixingEventId(null);
              router.refresh();
            }}
          />
        );
      })()}
    </>
  );
}
