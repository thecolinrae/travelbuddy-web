import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { EventFormState } from '@/hooks/use-event-form';

export function HotelFields({ form }: { form: EventFormState }) {
  const isCheckIn = form.formType === 'hotelIn';

  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="ev-hotel">Hotel name</Label>
        <Input
          id="ev-hotel"
          value={form.hotelName}
          onChange={(e) => form.setHotelName(e.target.value)}
          placeholder="e.g. The Ritz London"
        />
      </div>
      <div className="flex gap-3">
        <div className="space-y-1.5 flex-1">
          <Label htmlFor="ev-hi-city">City</Label>
          <Input
            id="ev-hi-city"
            value={form.locationCity}
            onChange={(e) => form.setLocationCity(e.target.value)}
            placeholder="e.g. London"
          />
        </div>
        <div className="space-y-1.5 flex-1">
          <Label htmlFor="ev-hi-addr">Address (optional)</Label>
          <Input
            id="ev-hi-addr"
            value={form.hotelAddress}
            onChange={(e) => form.setHotelAddress(e.target.value)}
            placeholder="e.g. 15 Piccadilly"
          />
        </div>
      </div>

      {isCheckIn && (
        <>
          <div className="flex gap-3">
            <div className="space-y-1.5 flex-1">
              <Label htmlFor="ev-checkout-date">Check-out date</Label>
              <Input
                id="ev-checkout-date"
                type="date"
                value={form.checkoutDate}
                onChange={(e) => form.setCheckoutDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 flex-1">
              <Label htmlFor="ev-checkout-time">Check-out time (optional)</Label>
              <Input
                id="ev-checkout-time"
                type="time"
                value={form.checkoutTime}
                onChange={(e) => form.setCheckoutTime(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ev-room">Room type (optional)</Label>
            <Input
              id="ev-room"
              value={form.roomType}
              onChange={(e) => form.setRoomType(e.target.value)}
              placeholder="e.g. Deluxe Double"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="ev-breakfast"
              type="checkbox"
              checked={form.breakfastIncluded}
              onChange={(e) => form.setBreakfastIncluded(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="ev-breakfast" className="font-normal">
              Breakfast included
            </Label>
          </div>
        </>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="ev-hi-bref">Booking ref (optional)</Label>
        <Input
          id="ev-hi-bref"
          value={form.hotelBookingRef}
          onChange={(e) => form.setHotelBookingRef(e.target.value)}
          placeholder="Confirmation number"
        />
      </div>

      {isCheckIn && (
        <div className="space-y-1.5">
          <Label htmlFor="ev-hi-notes">Notes (optional)</Label>
          <Input
            id="ev-hi-notes"
            value={form.hiNotes}
            onChange={(e) => form.setHiNotes(e.target.value)}
            placeholder="Any notes"
          />
        </div>
      )}
    </>
  );
}
