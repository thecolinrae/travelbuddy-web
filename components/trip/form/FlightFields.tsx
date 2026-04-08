import { ChevronDown, ChevronUp } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import type { EventFormState } from '@/hooks/use-event-form';

export function FlightFields({ form }: { form: EventFormState }) {
  const isDep = form.formType === 'flightDep';

  return (
    <>
      <div className="flex gap-3">
        <div className="space-y-1.5 flex-1">
          <Label htmlFor="ev-fno">Flight number</Label>
          <Input
            id="ev-fno"
            value={form.flightNo}
            onChange={(e) => form.setFlightNo(e.target.value)}
            placeholder="e.g. AC 123"
          />
        </div>
        <div className="space-y-1.5 flex-1">
          <Label htmlFor="ev-fl-city">City</Label>
          <Input
            id="ev-fl-city"
            value={form.locationCity}
            onChange={(e) => form.setLocationCity(e.target.value)}
            placeholder={isDep ? 'e.g. Toronto' : 'e.g. London'}
          />
        </div>
      </div>
      <div className="flex gap-3">
        <div className="space-y-1.5 flex-1">
          <Label htmlFor="ev-dep-apt">From (airport)</Label>
          <Input
            id="ev-dep-apt"
            value={form.depAirport}
            onChange={(e) => form.setDepAirport(e.target.value)}
            placeholder="e.g. YYZ"
          />
        </div>
        <div className="space-y-1.5 flex-1">
          <Label htmlFor="ev-arr-apt">To (airport)</Label>
          <Input
            id="ev-arr-apt"
            value={form.arrAirport}
            onChange={(e) => form.setArrAirport(e.target.value)}
            placeholder="e.g. LHR"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ev-fl-bref">Booking ref (optional)</Label>
        <Input
          id="ev-fl-bref"
          value={form.flightBookingRef}
          onChange={(e) => form.setFlightBookingRef(e.target.value)}
          placeholder="Confirmation number"
        />
      </div>

      {isDep && (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="ev-fd-notes">Notes (optional)</Label>
            <Input
              id="ev-fd-notes"
              value={form.fdNotes}
              onChange={(e) => form.setFdNotes(e.target.value)}
              placeholder="Any notes"
            />
          </div>

          <button
            type="button"
            onClick={() => form.setShowAdvanced((v) => !v)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {form.showAdvanced ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
            {form.showAdvanced ? 'Fewer details' : 'More details'}
          </button>

          {form.showAdvanced && (
            <div className="space-y-3 rounded-lg border bg-muted/30 px-3 py-3">
              <div className="flex gap-3">
                <div className="space-y-1.5 flex-1">
                  <Label htmlFor="ev-seat">Seat</Label>
                  <Input
                    id="ev-seat"
                    value={form.seatNumber}
                    onChange={(e) => form.setSeatNumber(e.target.value)}
                    placeholder="e.g. 12A"
                  />
                </div>
                <div className="space-y-1.5 flex-1">
                  <Label htmlFor="ev-gate">Gate</Label>
                  <Input
                    id="ev-gate"
                    value={form.gate}
                    onChange={(e) => form.setGate(e.target.value)}
                    placeholder="e.g. B22"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <div className="space-y-1.5 flex-1">
                  <Label htmlFor="ev-boarding">Boarding time</Label>
                  <Input
                    id="ev-boarding"
                    type="time"
                    value={form.boardingTime}
                    onChange={(e) => form.setBoardingTime(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5 flex-1">
                  <Label htmlFor="ev-class">Travel class</Label>
                  <Select
                    id="ev-class"
                    value={form.travelClass}
                    onChange={(e) => form.setTravelClass(e.target.value)}
                  >
                    <option value="">Not specified</option>
                    <option value="Economy">Economy</option>
                    <option value="Premium Economy">Premium Economy</option>
                    <option value="Business">Business</option>
                    <option value="First">First</option>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ev-baggage">Baggage allowance</Label>
                <Input
                  id="ev-baggage"
                  value={form.baggageAllowance}
                  onChange={(e) => form.setBaggageAllowance(e.target.value)}
                  placeholder="e.g. 23 kg"
                />
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
