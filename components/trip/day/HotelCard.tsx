'use client';

import { useState } from 'react';
import { LogIn, LogOut, Coffee, Award, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { fmt12 } from './utils';
import { EventDetailSheet } from './EventDetailSheet';
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

function InfoButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      aria-label="View details"
      onClick={onClick}
      className="shrink-0 text-text-muted hover:text-text-base transition-colors"
    >
      <Info className="h-4 w-4" />
    </button>
  );
}

function CheckInCard({ event }: { event: HotelCheckInEvent }) {
  const [open, setOpen] = useState(false);
  const visibleAmenities = event.amenities.slice(0, 4);
  const extraCount = event.amenities.length - 4;

  return (
    <>
      <div className="rounded-xl border bg-card p-4 space-y-3">
        {/* Hotel name + info button */}
        <div className="flex items-start gap-2">
          <p className="font-display font-semibold text-lg leading-snug flex-1 min-w-0">{event.hotelName}</p>
          <InfoButton onClick={() => setOpen(true)} />
        </div>

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

        {/* Amenities (capped on card, all in sheet) */}
        {visibleAmenities.length > 0 && (
          <div className="flex flex-wrap gap-1.5 items-center">
            {visibleAmenities.map((a) => (
              <Badge key={a} variant="outline" className="text-xs font-normal">
                {a}
              </Badge>
            ))}
            {extraCount > 0 && (
              <button
                onClick={() => setOpen(true)}
                className="text-xs text-text-muted hover:text-text-base transition-colors"
              >
                + {extraCount} more
              </button>
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
      <EventDetailSheet open={open} onOpenChange={setOpen} event={event} />
    </>
  );
}

function CheckOutCard({ event }: { event: HotelCheckOutEvent }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="rounded-xl border bg-card p-4 space-y-2">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-medium flex items-center gap-2">
              <LogOut className="h-4 w-4 text-accent shrink-0" />
              {event.time ? `Check out by ${fmt12(event.time)}` : 'Check out'}
            </p>
            <p className="text-sm text-text-muted">{event.hotelName}</p>
          </div>
          <InfoButton onClick={() => setOpen(true)} />
        </div>
        {event.bookingRef && (
          <p className="text-xs text-text-muted">{event.bookingRef}</p>
        )}
      </div>
      <EventDetailSheet open={open} onOpenChange={setOpen} event={event} />
    </>
  );
}

export function HotelCard({ event }: HotelCardProps) {
  if (event.subtype === 'check_in') return <CheckInCard event={event} />;
  return <CheckOutCard event={event} />;
}
