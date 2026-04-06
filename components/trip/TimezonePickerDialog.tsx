'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import { Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

interface TimezonePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string | undefined;
  onSelect: (iana: string) => void;
  /** If provided, shows a "Reset to auto-detect" footer link */
  onReset?: () => void;
}

interface TzOption {
  iana: string;
  city: string;
  region: string;
  offset: string;
  offsetMinutes: number;
}

function buildTzOptions(): TzOption[] {
  const zones: string[] = Intl.supportedValuesOf('timeZone');
  const now = Date.now();
  return zones
    .map((iana) => {
      const parts = iana.split('/');
      const region = parts[0] ?? '';
      const city = (parts[parts.length - 1] ?? iana).replace(/_/g, ' ');

      let offset = '';
      let offsetMinutes = 0;
      try {
        const fmt = new Intl.DateTimeFormat('en-US', {
          timeZone: iana,
          timeZoneName: 'shortOffset',
        });
        const tzPart = fmt.formatToParts(now).find((p) => p.type === 'timeZoneName');
        offset = tzPart?.value ?? '';
        const match = offset.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
        if (match) {
          const sign = match[1] === '+' ? 1 : -1;
          const h = parseInt(match[2], 10);
          const m = parseInt(match[3] ?? '0', 10);
          offsetMinutes = sign * (h * 60 + m);
        }
      } catch {
        // ignore unknown zones
      }

      return { iana, city, region, offset, offsetMinutes };
    })
    .sort((a, b) => a.offsetMinutes - b.offsetMinutes || a.iana.localeCompare(b.iana));
}

export function TimezonePickerDialog({
  open,
  onOpenChange,
  value,
  onSelect,
  onReset,
}: TimezonePickerDialogProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const allZones = useMemo(() => buildTzOptions(), []);

  const filtered = useMemo(() => {
    if (!query.trim()) return allZones.slice(0, 120);
    const q = query.toLowerCase();
    return allZones
      .filter(
        (z) =>
          z.iana.toLowerCase().includes(q) ||
          z.city.toLowerCase().includes(q) ||
          z.offset.toLowerCase().includes(q),
      )
      .slice(0, 100);
  }, [allZones, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col p-0 gap-0 max-w-md sm:max-w-lg max-h-[80vh]">
        <DialogHeader className="px-4 pt-4 pb-3 border-b border-border">
          <DialogTitle className="text-base font-semibold">Select timezone</DialogTitle>
        </DialogHeader>

        {/* Search */}
        <div className="px-4 py-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted pointer-events-none" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search city or timezone…"
              className="pl-9"
            />
          </div>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1 py-1">
          {filtered.length === 0 && (
            <p className="text-sm text-text-muted text-center py-8">No timezones found</p>
          )}
          {filtered.map((z) => {
            const isSelected = z.iana === value;
            return (
              <button
                key={z.iana}
                type="button"
                onClick={() => onSelect(z.iana)}
                className={[
                  'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                  isSelected
                    ? 'bg-primary/10 text-text-base'
                    : 'hover:bg-surface text-text-base',
                ].join(' ')}
              >
                <span className="w-[72px] shrink-0 text-xs font-medium text-text-muted tabular-nums">
                  {z.offset}
                </span>
                <span className={['text-sm leading-snug', isSelected ? 'font-medium' : ''].join(' ')}>
                  {z.city}
                  {z.region && z.region !== z.city && (
                    <span className="text-text-muted font-normal"> · {z.region}</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        {/* Footer: reset link (only when a value is already set) */}
        {onReset && value && (
          <div className="px-4 py-3 border-t border-border">
            <button
              type="button"
              onClick={() => {
                onReset();
                onOpenChange(false);
              }}
              className="text-xs text-text-muted hover:text-text-base underline underline-offset-2 transition-colors"
            >
              Reset to auto-detect
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
