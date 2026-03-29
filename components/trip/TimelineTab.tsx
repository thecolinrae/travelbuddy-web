'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, Pencil, Trash2, Loader2, CalendarDays,
  PlaneTakeoff, PlaneLanding, GitMerge,
  BedDouble, LogOut,
  Bus, Train, Ship, Car, Navigation,
  Receipt, Compass,
} from 'lucide-react';
import { fmt12 } from '@/components/trip/day/utils';
import { Button } from '@/components/ui/button';
import { EventFormModal, type TransportPrefill } from './EventFormModal';
import type { TimelineEvent, ExpenseEvent, TransportType, TransportDepartureEvent, TransportArrivalEvent } from '@/types';

const TRANSPORT_ICONS: Record<TransportType, React.ComponentType<{ className?: string }>> = {
  bus: Bus,
  train: Train,
  ferry: Ship,
  car_rental: Car,
  taxi: Car,
  rideshare: Car,
  other: Navigation,
};

function EventIcon({ e }: { e: TimelineEvent }) {
  if (e.type === 'flight') {
    if (e.subtype === 'departure') return <PlaneTakeoff className="h-4 w-4 text-secondary" />;
    if (e.subtype === 'arrival') return <PlaneLanding className="h-4 w-4 text-secondary" />;
    return <GitMerge className="h-4 w-4 text-secondary" />;
  }
  if (e.type === 'hotel') {
    if (e.subtype === 'check_in') return <BedDouble className="h-4 w-4 text-accent" />;
    return <LogOut className="h-4 w-4 text-accent" />;
  }
  if (e.type === 'otherTransportation') {
    const Icon = TRANSPORT_ICONS[e.transportType] ?? Navigation;
    return <Icon className="h-4 w-4 text-secondary" />;
  }
  if (e.type === 'expense') return <Receipt className="h-4 w-4 text-warning" />;
  if (e.type === 'activity') return <Compass className="h-4 w-4 text-green-700 dark:text-green-400" />;
  return <Navigation className="h-4 w-4 text-text-muted" />;
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
  if (e.type === 'otherTransportation') {
    if (e.subtype === 'departure') return `${e.departureLocation} → ${e.arrivalLocation}`;
    return `Arriving at ${e.arrivalLocation}`;
  }
  if (e.type === 'expense') return e.description;
  if (e.type === 'activity') return e.description;
  return e.locationCity;
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
  const [counterpartPrefill, setCounterpartPrefill] = useState<TransportPrefill | null>(null);

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
        <div className="py-16 flex flex-col items-center gap-4 text-center">
          <div className="rounded-full bg-surface p-4">
            <CalendarDays className="h-8 w-8 text-text-muted" />
          </div>
          <div className="space-y-1">
            <p className="font-semibold text-text-base">No events yet</p>
            <p className="type-caption max-w-xs">Import a booking document or add events manually to build your timeline.</p>
          </div>
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

  // Detect orphaned transport legs: events with journeyId missing their counterpart,
  // and events with no journeyId at all (manually created / corrected events).
  const transportJourneys = new Map<string, { dep?: TransportDepartureEvent; arr?: TransportArrivalEvent }>();
  for (const e of timeline) {
    if (e.type !== 'otherTransportation' || !e.journeyId) continue;
    const j = transportJourneys.get(e.journeyId) ?? {};
    if (e.subtype === 'departure') j.dep = e as TransportDepartureEvent;
    else j.arr = e as TransportArrivalEvent;
    transportJourneys.set(e.journeyId, j);
  }

  function getMissingCounterpart(e: TimelineEvent): 'arrival' | 'departure' | null {
    if (e.type !== 'otherTransportation') return null;
    // No journeyId → was created/corrected manually without a counterpart
    if (!e.journeyId) return e.subtype === 'departure' ? 'arrival' : 'departure';
    const j = transportJourneys.get(e.journeyId);
    if (!j) return null;
    if (e.subtype === 'departure' && !j.arr) return 'arrival';
    if (e.subtype === 'arrival' && !j.dep) return 'departure';
    return null;
  }

  async function handleAddCounterpart(e: TransportDepartureEvent | TransportArrivalEvent) {
    let journeyId = e.journeyId;

    // Assign a journeyId to the existing event if it doesn't have one yet,
    // so the new counterpart will be linked to it.
    if (!journeyId) {
      journeyId = crypto.randomUUID();
      await fetch(`/api/trips/${tripId}/timeline/${e.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...e, journeyId }),
      });
      router.refresh();
    }

    setCounterpartPrefill({
      transportSubtype: e.subtype === 'departure' ? 'arrival' : 'departure',
      depLocation: e.departureLocation,
      arrLocation: e.arrivalLocation,
      transportType: e.transportType,
      vendor: e.vendor,
      bookingRef: (e as TransportDepartureEvent).bookingRef,
      journeyId,
    });
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
                  <span className="mt-0.5 shrink-0"><EventIcon e={e} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{eventHeadline(e)}</p>
                    <div className="flex flex-wrap gap-x-3 mt-0.5">
                      {e.time && (
                        <span className="text-xs text-muted-foreground">{fmt12(e.time)}</span>
                      )}
                      {e.locationCity && (
                        <span className="text-xs text-muted-foreground">{e.locationCity}</span>
                      )}
                    </div>
                    {linkedExpenses.get(e.id)?.map((exp) => (
                      <p key={exp.id} className="text-xs text-muted-foreground mt-1">
                        {new Intl.NumberFormat('en-US', {
                          style: 'currency',
                          currency: exp.cost.preferredCurrency,
                        }).format(exp.cost.amountPreferredCurrency)}
                        {exp.description && ` · ${exp.description}`}
                      </p>
                    ))}
                    {isOwner && (() => {
                      const missing = getMissingCounterpart(e);
                      if (!missing) return null;
                      return (
                        <button
                          onClick={() => handleAddCounterpart(e as TransportDepartureEvent | TransportArrivalEvent)}
                          className="mt-1.5 inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 hover:underline"
                        >
                          <Plus className="h-3 w-3" />
                          Add missing {missing}
                        </button>
                      );
                    })()}
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
      {counterpartPrefill && (
        <EventFormModal
          tripId={tripId}
          open={!!counterpartPrefill}
          onClose={() => setCounterpartPrefill(null)}
          onSaved={() => { router.refresh(); setCounterpartPrefill(null); }}
          transportPrefill={counterpartPrefill}
        />
      )}
    </div>
  );
}
