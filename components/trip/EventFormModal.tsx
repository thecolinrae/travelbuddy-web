'use client';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useEventForm, type FormType } from '@/hooks/use-event-form';
import { EventDateTimeSection } from '@/components/trip/form/EventDateTimeSection';
import { ActivityFields } from '@/components/trip/form/ActivityFields';
import { TransportFields } from '@/components/trip/form/TransportFields';
import { FlightFields } from '@/components/trip/form/FlightFields';
import { HotelFields } from '@/components/trip/form/HotelFields';
import type { TimelineEvent, TransportDepartureEvent } from '@/types';

/** Pre-populate a new (non-edit) transport event — used when adding a missing counterpart. */
export interface TransportPrefill {
  transportSubtype: 'departure' | 'arrival';
  depLocation?: string;
  arrLocation?: string;
  transportType?: TransportDepartureEvent['transportType'];
  vendor?: string;
  bookingRef?: string;
  journeyId?: string;
}

interface Props {
  tripId: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editing?: TimelineEvent;
  /** Pre-fills a new transport event (create mode, not edit). */
  transportPrefill?: TransportPrefill;
}

export function EventFormModal({ tripId, open, onClose, onSaved, editing, transportPrefill }: Props) {
  const form = useEventForm({ tripId, editing, transportPrefill });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{form.dialogTitle()}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">

          {/* Type selector */}
          {!editing ? (
            <div className="space-y-1.5">
              <Label>Event type</Label>
              <div className="flex gap-2">
                {(
                  [
                    { value: 'activity', label: '🎭 Activity' },
                    { value: 'transport', label: '🚌 Transport' },
                    { value: 'other',    label: '📌 Other' },
                  ] as { value: FormType; label: string }[]
                ).map((t) => (
                  <button
                    key={t.value}
                    onClick={() => form.setFormType(t.value)}
                    className={[
                      'flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                      form.formType === t.value
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border text-muted-foreground hover:border-muted-foreground/40',
                    ].join(' ')}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="ev-type">Event type</Label>
              <Select
                id="ev-type"
                value={form.formType}
                onChange={(e) => form.setFormType(e.target.value as FormType)}
              >
                <option value="flightDep">Flight departure</option>
                <option value="flightArr">Flight arrival</option>
                <option value="hotelIn">Hotel check-in</option>
                <option value="hotelOut">Hotel check-out</option>
                <option value="transport">Transport</option>
                <option value="activity">Activity</option>
                <option value="other">Other</option>
              </Select>
            </div>
          )}

          {/* Date + time + timezone — all types */}
          <EventDateTimeSection form={form} />

          {/* Type-specific fields */}
          {(form.formType === 'activity' || form.formType === 'other') && (
            <ActivityFields form={form} />
          )}
          {form.formType === 'transport' && <TransportFields form={form} />}
          {(form.formType === 'flightDep' || form.formType === 'flightArr') && (
            <FlightFields form={form} />
          )}
          {(form.formType === 'hotelIn' || form.formType === 'hotelOut') && (
            <HotelFields form={form} />
          )}

        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={form.saving}>
            Cancel
          </Button>
          <Button
            onClick={() => form.handleSave(onSaved, onClose)}
            disabled={form.saving || !form.isValid()}
          >
            {form.saving ? 'Saving…' : editing ? 'Save changes' : 'Add event'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
