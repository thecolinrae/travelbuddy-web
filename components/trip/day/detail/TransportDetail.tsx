import { Clock, Globe, Users, Navigation } from 'lucide-react';
import { SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { SectionLabel, DetailRow, TRANSPORT_ICONS, TRANSPORT_LABELS, fmt12, fmtUtc, tzAbbr } from './shared';
import type { TransportDepartureEvent, TransportArrivalEvent } from '@/types';

export function TransportDetail({ event }: { event: TransportDepartureEvent | TransportArrivalEvent }) {
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
