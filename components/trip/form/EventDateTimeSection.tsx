import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TimezoneSelectorField } from '@/components/trip/TimezoneSelectorField';
import type { EventFormState } from '@/hooks/use-event-form';

export function EventDateTimeSection({ form }: { form: EventFormState }) {
  return (
    <>
      <div className="flex gap-3">
        <div className="space-y-1.5 flex-1">
          <Label htmlFor="ev-date">Date</Label>
          <Input
            id="ev-date"
            type="date"
            value={form.date}
            onChange={(e) => form.setDate(e.target.value)}
          />
        </div>
        <div className="space-y-1.5 flex-1">
          <Label htmlFor="ev-time">Time (optional)</Label>
          <Input
            id="ev-time"
            type="time"
            value={form.time}
            onChange={(e) => form.setTime(e.target.value)}
          />
        </div>
      </div>
      <TimezoneSelectorField
        timezone={form.timezone}
        date={form.date}
        onChange={form.setTimezone}
        onClear={() => form.setTimezone(undefined)}
      />
    </>
  );
}
