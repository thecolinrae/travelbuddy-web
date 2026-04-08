import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import type { EventFormState } from '@/hooks/use-event-form';
import type { TransportDepartureEvent } from '@/types';

export function TransportFields({ form }: { form: EventFormState }) {
  return (
    <>
      <div className="space-y-1.5">
        <Label>Leg type</Label>
        <div className="flex gap-2">
          {(['departure', 'arrival'] as const).map((sub) => (
            <button
              key={sub}
              type="button"
              onClick={() => form.setTransportSubtype(sub)}
              className={[
                'flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors capitalize',
                form.transportSubtype === sub
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border text-muted-foreground hover:border-muted-foreground/40',
              ].join(' ')}
            >
              {sub}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-3">
        <div className="space-y-1.5 flex-1">
          <Label htmlFor="ev-dep">From</Label>
          <Input
            id="ev-dep"
            value={form.depLocation}
            onChange={(e) => form.setDepLocation(e.target.value)}
            placeholder="e.g. Paris"
          />
        </div>
        <div className="space-y-1.5 flex-1">
          <Label htmlFor="ev-arr">To</Label>
          <Input
            id="ev-arr"
            value={form.arrLocation}
            onChange={(e) => form.setArrLocation(e.target.value)}
            placeholder="e.g. Lyon"
          />
        </div>
      </div>
      <div className="flex gap-3">
        <div className="space-y-1.5 flex-1">
          <Label htmlFor="ev-ttype">Type</Label>
          <Select
            id="ev-ttype"
            value={form.transportType}
            onChange={(e) =>
              form.setTransportType(e.target.value as TransportDepartureEvent['transportType'])
            }
          >
            <option value="bus">Bus</option>
            <option value="train">Train</option>
            <option value="ferry">Ferry</option>
            <option value="car_rental">Car rental</option>
            <option value="taxi">Taxi</option>
            <option value="rideshare">Rideshare</option>
            <option value="other">Other</option>
          </Select>
        </div>
        <div className="space-y-1.5 flex-1">
          <Label htmlFor="ev-vendor">Vendor (optional)</Label>
          <Input
            id="ev-vendor"
            value={form.vendor}
            onChange={(e) => form.setVendor(e.target.value)}
            placeholder="e.g. Eurostar"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ev-tr-bref">Booking ref (optional)</Label>
        <Input
          id="ev-tr-bref"
          value={form.trBookingRef}
          onChange={(e) => form.setTrBookingRef(e.target.value)}
          placeholder="Confirmation number"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ev-tr-notes">Notes (optional)</Label>
        <Input
          id="ev-tr-notes"
          value={form.trNotes}
          onChange={(e) => form.setTrNotes(e.target.value)}
          placeholder="Any notes"
        />
      </div>
    </>
  );
}
