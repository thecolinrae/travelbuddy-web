'use client';

import { useState } from 'react';
import { AlertCircle, Clock, Pencil } from 'lucide-react';
import { tzAbbr } from '@/components/trip/day/utils';
import { TimezonePickerDialog } from '@/components/trip/TimezonePickerDialog';

interface TimezoneSelectorFieldProps {
  timezone: string | undefined;
  date: string;
  onChange: (iana: string) => void;
  onClear: () => void;
}

export function TimezoneSelectorField({
  timezone,
  date,
  onChange,
  onClear,
}: TimezoneSelectorFieldProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const abbr = timezone ? (tzAbbr(timezone, date) || timezone) : '';

  if (timezone) {
    // ── Subtle mode — timezone is known ────────────────────────────────────────
    return (
      <>
        <div className="flex items-center gap-2 group">
          <Clock className="h-4 w-4 text-text-muted shrink-0" />
          <span className="text-xs font-medium text-text-muted bg-surface px-2 py-0.5 rounded-full border border-border">
            {abbr}
          </span>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="flex items-center gap-1 text-xs text-text-muted opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:text-text-base"
          >
            <Pencil className="h-3 w-3" />
            change
          </button>
        </div>
        <TimezonePickerDialog
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          value={timezone}
          onSelect={(iana) => {
            onChange(iana);
            setPickerOpen(false);
          }}
          onReset={onClear}
        />
      </>
    );
  }

  // ── Prominent mode — timezone missing ──────────────────────────────────────
  return (
    <>
      <div className="rounded-md border border-warning/50 bg-warning/10 dark:bg-warning/5 p-3 flex items-start gap-2">
        <AlertCircle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-text-base leading-relaxed">
            Timezone unknown — times may not sort correctly.
          </p>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="mt-1 text-sm font-medium text-secondary hover:underline underline-offset-2"
          >
            Set timezone
          </button>
        </div>
      </div>
      <TimezonePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        value={timezone}
        onSelect={(iana) => {
          onChange(iana);
          setPickerOpen(false);
        }}
      />
    </>
  );
}
