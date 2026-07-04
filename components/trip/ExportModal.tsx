'use client';

import { useState } from 'react';
import { Download, FileText, FileArchive, BookOpen, CalendarClock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// Largest hour range the agenda PDF can render without overflowing its half-page
// column — keep this in sync with AGENDA_MAX_HOURS in services/export/pdf-agenda.ts
// (that module is server-only and can't be imported from a client component).
const AGENDA_MAX_HOURS = 16;

function formatHourOption(hour: number): string {
  const h = hour % 24;
  if (h === 0) return hour === 24 ? 'Midnight' : '12:00 AM';
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayHour = h % 12 || 12;
  return `${displayHour}:00 ${ampm}`;
}

interface Props {
  open: boolean;
  onClose: () => void;
  tripId: string;
  tripName: string;
}

type Format = 'zip' | 'markdown' | 'pdf' | 'agenda';

const FORMATS: Array<{
  id: Format;
  icon: React.ElementType;
  label: string;
  description: string;
  buttonLabel: string;
  color: string;
}> = [
  {
    id: 'zip',
    icon: FileArchive,
    label: 'Trip Package',
    description: 'Complete backup — all trip data plus uploaded documents. Re-importable into TravelBuddy on any account.',
    buttonLabel: 'Download .zip',
    color: 'text-secondary',
  },
  {
    id: 'markdown',
    icon: FileText,
    label: 'Markdown',
    description: 'Day-by-day itinerary as plain text with YAML frontmatter. Works with Obsidian, Notion, and any notes app.',
    buttonLabel: 'Download .md',
    color: 'text-green-700 dark:text-green-400',
  },
  {
    id: 'pdf',
    icon: BookOpen,
    label: 'Trip Binder',
    description: 'Printable PDF with cover page, booking quick-reference, daily itinerary, and budget summary.',
    buttonLabel: 'Download PDF',
    color: 'text-accent',
  },
  {
    id: 'agenda',
    icon: CalendarClock,
    label: 'Agenda (Print)',
    description: 'Landscape day-planner PDF — two days per page with an hourly grid, ready to fill in by hand.',
    buttonLabel: 'Download PDF',
    color: 'text-secondary',
  },
];

export function ExportModal({ open, onClose, tripId, tripName }: Props) {
  const [loading, setLoading] = useState<Format | null>(null);
  const [agendaStart, setAgendaStart] = useState(8);
  const [agendaEnd, setAgendaEnd] = useState(20);
  const [agendaBooklet, setAgendaBooklet] = useState(false);

  const maxEnd = Math.min(24, agendaStart + AGENDA_MAX_HOURS);
  const endOptions = Array.from({ length: maxEnd - agendaStart }, (_, i) => agendaStart + i + 1);

  function handleStartChange(value: number) {
    setAgendaStart(value);
    setAgendaEnd((prevEnd) => Math.min(Math.max(prevEnd, value + 1), value + AGENDA_MAX_HOURS, 24));
  }

  async function handleDownload(format: Format) {
    if (loading) return;
    setLoading(format);
    try {
      const query = format === 'agenda'
        ? `&startHour=${agendaStart}&endHour=${agendaEnd}${agendaBooklet ? '&booklet=1' : ''}`
        : '';
      const res = await fetch(`/api/trips/${tripId}/export?format=${format}${query}`);
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Export failed');
      }

      // Determine filename from Content-Disposition header or fall back to a default
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const match = /filename="([^"]+)"/.exec(disposition);
      const slug = tripName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const ext = format === 'zip' ? '.zip'
        : format === 'markdown' ? '.md'
        : format === 'agenda' ? `-agenda${agendaBooklet ? '-booklet' : ''}.pdf`
        : '-binder.pdf';
      const filename = match?.[1] ?? `${slug}${ext}`;

      // Trigger browser download
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`${FORMATS.find((f) => f.id === format)?.label} downloaded`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setLoading(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Export Trip</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {FORMATS.map((fmt, i) => {
            const Icon = fmt.icon;
            const isLoading = loading === fmt.id;
            return (
              <div
                key={fmt.id}
                className={[
                  'rounded-xl border bg-card p-4',
                  i < FORMATS.length - 1 ? '' : '',
                ].join(' ')}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-lg bg-surface p-2 shrink-0">
                    <Icon className={`h-4 w-4 ${fmt.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-text-base leading-snug">
                      {fmt.label}
                    </p>
                    <p className="type-caption leading-relaxed mt-0.5">
                      {fmt.description}
                    </p>
                  </div>
                </div>
                {fmt.id === 'agenda' && (
                  <div className="mt-3 flex items-center gap-2">
                    <Select
                      className="h-8 w-auto text-xs"
                      value={agendaStart}
                      onChange={(e) => handleStartChange(Number(e.target.value))}
                      aria-label="Agenda start time"
                    >
                      {Array.from({ length: 24 }, (_, h) => h).map((h) => (
                        <option key={h} value={h}>{formatHourOption(h)}</option>
                      ))}
                    </Select>
                    <span className="type-caption">to</span>
                    <Select
                      className="h-8 w-auto text-xs"
                      value={agendaEnd}
                      onChange={(e) => setAgendaEnd(Number(e.target.value))}
                      aria-label="Agenda end time"
                    >
                      {endOptions.map((h) => (
                        <option key={h} value={h}>{formatHourOption(h)}</option>
                      ))}
                    </Select>
                  </div>
                )}
                {fmt.id === 'agenda' && (
                  <div className="mt-2.5 flex items-start gap-2">
                    <input
                      id="agenda-booklet"
                      type="checkbox"
                      checked={agendaBooklet}
                      onChange={(e) => setAgendaBooklet(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300"
                    />
                    <Label htmlFor="agenda-booklet" className="font-normal">
                      <span className="block text-xs text-text-base">Print as booklet</span>
                      <span className="block type-caption leading-relaxed">
                        Reorders the pages for double-sided printing — fold the whole stack in half and staple the crease. Use your printer&apos;s &quot;flip on short edge&quot; duplex setting.
                      </span>
                    </Label>
                  </div>
                )}
                <div className="mt-3 flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDownload(fmt.id)}
                    disabled={!!loading}
                    className="gap-1.5"
                  >
                    {isLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    {isLoading ? 'Exporting…' : fmt.buttonLabel}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
