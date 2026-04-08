import { Clock, Hash, LogIn, LogOut, Coffee, Award, MapPin } from 'lucide-react';
import { SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { SectionLabel, DetailRow, formatShortDate, fmt12 } from './shared';
import type { HotelCheckInEvent, HotelCheckOutEvent } from '@/types';

export function HotelCheckInDetail({ event }: { event: HotelCheckInEvent }) {
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

        {event.breakfastIncluded && (
          <div className="flex items-center gap-2 text-sm text-text-base">
            <Coffee className="h-4 w-4 text-text-muted shrink-0" />
            Breakfast included
          </div>
        )}

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

        {event.loyaltyStatus && (
          <p className="text-sm text-text-muted flex items-center gap-1.5">
            <Award className="h-4 w-4 shrink-0" />
            {event.loyaltyStatus}
            {event.loyaltyNumber && ` · ${event.loyaltyNumber}`}
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

export function HotelCheckOutDetail({ event }: { event: HotelCheckOutEvent }) {
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
