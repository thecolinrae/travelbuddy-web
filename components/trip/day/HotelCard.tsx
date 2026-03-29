import { LogIn, LogOut, Coffee, Award } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { fmt12 } from './utils';
import type { HotelCheckInEvent, HotelCheckOutEvent } from '@/types';

type HotelEvent = HotelCheckInEvent | HotelCheckOutEvent;

interface HotelCardProps {
  event: HotelEvent;
}

function formatShortDate(date: string): string {
  return new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function CheckInCard({ event }: { event: HotelCheckInEvent }) {
  const visibleAmenities = event.amenities.slice(0, 4);
  const extraCount = event.amenities.length - 4;

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      {/* Hotel name */}
      <p className="font-display font-semibold text-lg leading-snug">{event.hotelName}</p>

      {/* Check-in / check-out row */}
      <div className="flex flex-col gap-1">
        <p className="text-sm text-text-muted flex items-center gap-1.5">
          <LogIn className="h-4 w-4 text-accent shrink-0" />
          Check in from {fmt12(event.time) || fmt12('15:00')}
        </p>
        {event.checkoutDate && (
          <p className="text-sm text-text-muted flex items-center gap-1.5">
            <LogOut className="h-4 w-4 text-accent shrink-0" />
            Check out by {event.checkoutTime ? fmt12(event.checkoutTime) : '11:00 AM'} · {formatShortDate(event.checkoutDate)}
          </p>
        )}
      </div>

      {/* Room + nights */}
      {(event.roomType || event.numberOfNights) && (
        <p className="text-sm text-text-muted">
          {[event.roomType, event.numberOfNights ? `${event.numberOfNights} night${event.numberOfNights > 1 ? 's' : ''}` : null]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}

      {/* Breakfast */}
      {event.breakfastIncluded === true && (
        <Badge variant="outline" className="gap-1 w-fit">
          <Coffee className="h-3.5 w-3.5" />
          Breakfast included
        </Badge>
      )}

      {/* Amenities */}
      {visibleAmenities.length > 0 && (
        <div className="flex flex-wrap gap-1.5 items-center">
          {visibleAmenities.map((a) => (
            <Badge key={a} variant="outline" className="text-xs font-normal">
              {a}
            </Badge>
          ))}
          {extraCount > 0 && (
            <span className="text-xs text-text-muted">+ {extraCount} more</span>
          )}
        </div>
      )}

      {/* Loyalty */}
      {event.loyaltyStatus && (
        <p className="text-sm text-text-muted flex items-center gap-1.5">
          <Award className="h-4 w-4" />
          {event.loyaltyStatus}
        </p>
      )}

      {/* Booking ref */}
      {event.bookingRef && (
        <p className="text-xs text-text-muted text-right">{event.bookingRef}</p>
      )}
    </div>
  );
}

function CheckOutCard({ event }: { event: HotelCheckOutEvent }) {
  return (
    <div className="rounded-xl border bg-card p-4 space-y-2">
      <p className="font-medium flex items-center gap-2">
        <LogOut className="h-4 w-4 text-accent shrink-0" />
        {event.time ? `Check out by ${fmt12(event.time)}` : 'Check out'}
      </p>
      <p className="text-sm text-text-muted">{event.hotelName}</p>
      {event.bookingRef && (
        <p className="text-xs text-text-muted">{event.bookingRef}</p>
      )}
    </div>
  );
}

export function HotelCard({ event }: HotelCardProps) {
  if (event.subtype === 'check_in') return <CheckInCard event={event} />;
  return <CheckOutCard event={event} />;
}
