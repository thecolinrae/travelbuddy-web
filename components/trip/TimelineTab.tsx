'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EventFormModal } from './EventFormModal';
import type { TimelineEvent, ExpenseEvent } from '@/types';

function eventIcon(e: TimelineEvent): string {
  if (e.type === 'flight') return e.subtype === 'departure' ? '✈️' : '🛬';
  if (e.type === 'hotel') return e.subtype === 'check_in' ? '🏨' : '🔑';
  if (e.type === 'otherTransportation') return e.subtype === 'departure' ? '🚌' : '📍';
  if (e.type === 'expense') return '💰';
  if (e.type === 'activity') return '🎭';
  return '📌';
}

function eventHeadline(e: TimelineEvent): string {
  if (e.type === 'flight' && e.subtype === 'departure')
    return `${e.flightNo} · ${e.departureAirport} → ${e.arrivalAirport}`;
  if (e.type === 'flight' && e.subtype === 'arrival')
    return `Arrive ${e.arrivalAirport} on ${e.flightNo}`;
  if (e.type === 'hotel' && e.subtype === 'check_in')
    return `Check in — ${e.hotelName}`;
  if (e.type === 'hotel' && e.subtype === 'check_out')
    return `Check out — ${e.hotelName}`;
  if (e.type === 'otherTransportation')
    return `${e.departureLocation} → ${e.arrivalLocation}`;
  if (e.type === 'expense') return e.description;
  if (e.type === 'activity') return e.description;
  return e.locationCity;
}

function fmt12(time?: string): string {
  if (!time) return '';
  const [hStr, mStr] = time.split(':');
  const h = parseInt(hStr, 10);
  const m = mStr ?? '00';
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${suffix}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function isEditable(e: TimelineEvent): boolean {
  return e.type !== 'expense';
}

interface Props {
  tripId: string;
  timeline: TimelineEvent[];
  isOwner: boolean;
}

export function TimelineTab({ tripId, timeline, isOwner }: Props) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<TimelineEvent | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      await fetch(`/api/trips/${tripId}/timeline/${id}`, { method: 'DELETE' });
      router.refresh();
    } finally {
      setDeleting(null);
      setConfirmDelete(null);
    }
  }

  if (timeline.length === 0) {
    return (
      <div className="space-y-4">
        {isOwner && (
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={() => setAddOpen(true)} className="gap-1.5">
              <Plus className="h-4 w-4" /> Add event
            </Button>
          </div>
        )}
        <div className="py-12 text-center text-muted-foreground text-sm">
          No events in the timeline yet.
        </div>
        {addOpen && (
          <EventFormModal
            tripId={tripId}
            open={addOpen}
            onClose={() => setAddOpen(false)}
            onSaved={() => router.refresh()}
          />
        )}
      </div>
    );
  }

  // Build a map of linked expenses keyed by their parent event id.
  // Expenses without a linkedEventId are not shown in the Timeline at all
  // (they live in the Expenses tab).
  const linkedExpenses = new Map<string, ExpenseEvent[]>();
  for (const e of timeline) {
    if (e.type !== 'expense') continue;
    const exp = e as ExpenseEvent;
    if (!exp.linkedEventId) continue;
    const bucket = linkedExpenses.get(exp.linkedEventId) ?? [];
    bucket.push(exp);
    linkedExpenses.set(exp.linkedEventId, bucket);
  }

  // Group non-expense events by date
  const byDate = new Map<string, TimelineEvent[]>();
  for (const e of timeline) {
    if (e.type === 'expense') continue;
    const day = e.date;
    if (!byDate.has(day)) byDate.set(day, []);
    byDate.get(day)!.push(e);
  }

  const days = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="space-y-4">
      {isOwner && (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={() => setAddOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" /> Add event
          </Button>
        </div>
      )}

      <div className="space-y-8">
        {days.map(([date, events]) => (
          <div key={date}>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              {formatDate(date)}
            </h3>
            <ul className="space-y-2">
              {events.map((e) => (
                <li key={e.id} className="flex items-start gap-3 rounded-lg border bg-card px-4 py-3">
                  <span className="text-lg leading-none mt-0.5 shrink-0">{eventIcon(e)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{eventHeadline(e)}</p>
                    <div className="flex flex-wrap gap-x-3 mt-0.5">
                      {e.time && (
                        <span className="text-xs text-muted-foreground">{fmt12(e.time)}</span>
                      )}
                      {e.locationCity && (
                        <span className="text-xs text-muted-foreground">📍 {e.locationCity}</span>
                      )}
                    </div>
                    {linkedExpenses.get(e.id)?.map((exp) => (
                      <p key={exp.id} className="text-xs text-muted-foreground mt-1">
                        💰{' '}
                        {new Intl.NumberFormat('en-US', {
                          style: 'currency',
                          currency: exp.cost.preferredCurrency,
                        }).format(exp.cost.amountPreferredCurrency)}
                        {exp.description && ` · ${exp.description}`}
                      </p>
                    ))}
                  </div>

                  {isOwner && (
                    <div className="flex items-center gap-1 shrink-0">
                      {confirmDelete === e.id ? (
                        <>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDelete(e.id)}
                            disabled={deleting === e.id}
                          >
                            {deleting === e.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Delete'}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <>
                          {isEditable(e) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditing(e)}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirmDelete(e.id)}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {addOpen && (
        <EventFormModal
          tripId={tripId}
          open={addOpen}
          onClose={() => setAddOpen(false)}
          onSaved={() => router.refresh()}
        />
      )}
      {editing && (
        <EventFormModal
          tripId={tripId}
          open={!!editing}
          onClose={() => setEditing(null)}
          onSaved={() => router.refresh()}
          editing={editing}
        />
      )}
    </div>
  );
}
