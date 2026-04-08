import { Sparkles, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import type { EventFormState } from '@/hooks/use-event-form';

export function ActivityFields({ form }: { form: EventFormState }) {
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="ev-desc">Description</Label>
        <Input
          id="ev-desc"
          value={form.description}
          onChange={(e) => form.setDescription(e.target.value)}
          placeholder="e.g. Visit the Louvre"
        />
        {form.originalDescription !== undefined &&
          form.formType === 'activity' &&
          form.description.trim() !== form.originalDescription && (
            <button
              type="button"
              onClick={form.handleReEnrich}
              disabled={form.enriching}
              className="flex items-center gap-1.5 text-xs text-secondary hover:underline disabled:opacity-50"
            >
              {form.enriching ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Enriching details…
                </>
              ) : (
                <>
                  <Sparkles className="h-3 w-3" />
                  Re-enrich details for new title
                </>
              )}
            </button>
          )}
      </div>
      <div className="flex gap-3">
        <div className="space-y-1.5 flex-1">
          <Label htmlFor="ev-city">City</Label>
          <Input
            id="ev-city"
            value={form.locationCity}
            onChange={(e) => form.setLocationCity(e.target.value)}
            placeholder="e.g. Paris"
          />
        </div>
        {form.formType === 'activity' && (
          <div className="space-y-1.5 flex-1">
            <Label htmlFor="ev-cat">Category</Label>
            <Select
              id="ev-cat"
              value={form.actCategory}
              onChange={(e) => form.setActCategory(e.target.value)}
            >
              <option value="sightseeing">Sightseeing</option>
              <option value="food">Food</option>
              <option value="adventure">Adventure</option>
              <option value="culture">Culture</option>
              <option value="shopping">Shopping</option>
              <option value="nightlife">Nightlife</option>
              <option value="nature">Nature</option>
              <option value="wellness">Wellness</option>
            </Select>
          </div>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ev-addr">Address (optional)</Label>
        <Input
          id="ev-addr"
          value={form.actAddress}
          onChange={(e) => form.setActAddress(e.target.value)}
          placeholder="Neighbourhood or address"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ev-act-bref">Booking ref (optional)</Label>
        <Input
          id="ev-act-bref"
          value={form.actBookingRef}
          onChange={(e) => form.setActBookingRef(e.target.value)}
          placeholder="Confirmation number"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ev-act-notes">Notes (optional)</Label>
        <Input
          id="ev-act-notes"
          value={form.actNotes}
          onChange={(e) => form.setActNotes(e.target.value)}
          placeholder="Any notes"
        />
      </div>
    </>
  );
}
