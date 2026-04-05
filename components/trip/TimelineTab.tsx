'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, Pencil, Trash2, Loader2, CalendarDays,
  PlaneTakeoff, PlaneLanding, GitMerge,
  BedDouble, LogOut,
  Bus, Train, Ship, Car, Navigation,
  Receipt,
} from 'lucide-react';
import { fmt12, fmtUtc, tzAbbr } from '@/components/trip/day/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CategoryIcon } from '@/components/trip/activityIcons';
import { ActivityEditModal } from './activities/ActivityEditModal';
import { EventFormModal, type TransportPrefill } from './EventFormModal';
import { MergeDndContext } from './dnd/MergeDndContext';
import { DraggableItem } from './dnd/DraggableItem';
import { DroppableTarget } from './dnd/DroppableTarget';
import type { TimelineEvent, ExpenseEvent, TransportType, TransportDepartureEvent, TransportArrivalEvent, Activity, ActivityEvent } from '@/types';
import { nanoid } from '@/services/nanoid';

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
  if (e.type === 'activity') return <Navigation className="h-4 w-4 text-green-700 dark:text-green-400" />;
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
  activities: Activity[];
  isOwner: boolean;
}

export function TimelineTab({ tripId, timeline, activities, isOwner }: Props) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<TimelineEvent | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [counterpartPrefill, setCounterpartPrefill] = useState<TransportPrefill | null>(null);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [confirmDeleteActivity, setConfirmDeleteActivity] = useState<string | null>(null);
  const [deletingActivity, setDeletingActivity] = useState<string | null>(null);

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

  async function handleDeleteActivity(id: string) {
    setDeletingActivity(id);
    try {
      await fetch(`/api/trips/${tripId}/activities`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activities: activities.filter((a) => a.id !== id) }),
      });
      router.refresh();
    } finally {
      setDeletingActivity(null);
      setConfirmDeleteActivity(null);
    }
  }

  async function handleEditActivity(updated: Activity) {
    await fetch(`/api/trips/${tripId}/activities`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activities: activities.map((a) => (a.id === updated.id ? updated : a)) }),
    });
    router.refresh();
    setEditingActivity(null);
  }

  const hasContent = timeline.some((e) => e.type !== 'expense') || activities.some((a) => a.saved && a.scheduledDate);
  if (!hasContent) {
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
      journeyId = nanoid();
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

  // Group non-expense timeline events by date
  const byDate = new Map<string, TimelineEvent[]>();
  for (const e of timeline) {
    if (e.type === 'expense') continue;
    const day = e.date;
    if (!byDate.has(day)) byDate.set(day, []);
    byDate.get(day)!.push(e);
  }

  // Merge scheduled saved activities into the same date buckets.
  // Skip activities that are linked to a timeline event — those are
  // absorbed into the ActivityEventCard and should not appear separately.
  const linkedActivityIds = new Set(
    timeline
      .filter((e): e is ActivityEvent => e.type === 'activity')
      .map((e) => e.linkedActivityId)
      .filter((id): id is string => !!id),
  );
  const scheduledActivities = activities.filter(
    (a) => a.saved && a.scheduledDate && !linkedActivityIds.has(a.id),
  );
  const activitiesByDate = new Map<string, Activity[]>();
  for (const a of scheduledActivities) {
    const day = a.scheduledDate!;
    if (!activitiesByDate.has(day)) activitiesByDate.set(day, []);
    activitiesByDate.get(day)!.push(a);
  }

  // Build the union of all dates
  const allDates = new Set([...byDate.keys(), ...activitiesByDate.keys()]);
  const days = [...allDates].sort();

  // Unlinked items eligible for DnD merging
  const unlinkedActivityEvents = timeline.filter(
    (e): e is ActivityEvent => e.type === 'activity' && !e.linkedActivityId,
  );
  const unlinkedActivities = scheduledActivities.filter((a) => !a.linkedEventId);

  return (
    <div className="space-y-4">
      {isOwner && (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={() => setAddOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" /> Add event
          </Button>
        </div>
      )}

      <MergeDndContext
        tripId={tripId}
        activities={unlinkedActivities}
        activityEvents={unlinkedActivityEvents}
        isOwner={isOwner}
      >
      <div className="space-y-8">
        {days.map((date) => {
          const events = byDate.get(date) ?? [];
          const dayActivities = activitiesByDate.get(date) ?? [];

          // Build merged items sorted by UTC time when available, local time otherwise.
          type EventItem = { kind: 'event'; data: TimelineEvent; sortMs: number };
          type ActivityItem = { kind: 'activity'; data: Activity; sortMs: number };
          type MergedItem = EventItem | ActivityItem;

          function eventSortMs(e: TimelineEvent): number {
            if (e.utcISO) return new Date(e.utcISO).getTime();
            if (e.date && e.time) return new Date(`${e.date}T${e.time}`).getTime();
            if (e.date) return new Date(`${e.date}T23:59:59`).getTime();
            return Number.MAX_SAFE_INTEGER;
          }
          function activitySortMs(a: Activity): number {
            if (a.scheduledDate && a.scheduledTime) return new Date(`${a.scheduledDate}T${a.scheduledTime}`).getTime();
            if (a.scheduledDate) return new Date(`${a.scheduledDate}T23:59:59`).getTime();
            return Number.MAX_SAFE_INTEGER;
          }

          const merged: MergedItem[] = [
            ...events.map((e) => ({ kind: 'event' as const, data: e, sortMs: eventSortMs(e) })),
            ...dayActivities.map((a) => ({ kind: 'activity' as const, data: a, sortMs: activitySortMs(a) })),
          ].sort((a, b) => a.sortMs - b.sortMs);

          return (
            <div key={date}>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                {formatDate(date)}
              </h3>
              <ul className="space-y-2">
                {merged.map((item) => {
                  if (item.kind === 'activity') {
                    const a = item.data;
                    const canMerge = isOwner && !a.linkedEventId;
                    return (
                      <li key={`activity-${a.id}`}>
                        <DraggableItem id={`activity:${a.id}`} disabled={!canMerge}>
                          {(handle) => (
                            <DroppableTarget id={`activity:${a.id}`}>
                              <div className="flex items-start gap-3 rounded-lg border bg-card px-4 py-3">
                                <span className="mt-0.5 shrink-0"><CategoryIcon type={a.type} /></span>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-sm font-medium">{a.name}</p>
                                    <Badge variant="outline" className="text-xs font-normal bg-primary/10 text-primary-foreground border-primary/30">
                                      Planned
                                    </Badge>
                                  </div>
                                  <div className="flex flex-wrap gap-x-3 mt-0.5">
                                    {a.scheduledTime && (
                                      <span className="text-xs text-muted-foreground">{fmt12(a.scheduledTime)}</span>
                                    )}
                                    {a.city && (
                                      <span className="text-xs text-muted-foreground">{a.city}</span>
                                    )}
                                  </div>
                                </div>
                                {isOwner && (
                                  <div className="flex items-center gap-1 shrink-0">
                                    {handle}
                                    {confirmDeleteActivity === a.id ? (
                                      <>
                                        <Button
                                          variant="destructive"
                                          size="sm"
                                          onClick={() => handleDeleteActivity(a.id)}
                                          disabled={deletingActivity === a.id}
                                        >
                                          {deletingActivity === a.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Delete'}
                                        </Button>
                                        <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteActivity(null)}>
                                          Cancel
                                        </Button>
                                      </>
                                    ) : (
                                      <>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => setEditingActivity(a)}
                                          className="text-muted-foreground hover:text-foreground"
                                        >
                                          <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => setConfirmDeleteActivity(a.id)}
                                          className="text-muted-foreground hover:text-destructive"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                            </DroppableTarget>
                          )}
                        </DraggableItem>
                      </li>
                    );
                  }

                  const e = item.data;
                  const canMergeEvent = isOwner && e.type === 'activity' && !(e as ActivityEvent).linkedActivityId;
                  return (
                    <li key={e.id}>
                      <DraggableItem id={`event:${e.id}`} disabled={!canMergeEvent}>
                        {(handle) => (
                          <DroppableTarget id={`event:${e.id}`}>
                            <div className="flex items-start gap-3 rounded-lg border bg-card px-4 py-3">
                              <span className="mt-0.5 shrink-0"><EventIcon e={e} /></span>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium">{eventHeadline(e)}</p>
                                <div className="flex flex-wrap gap-x-3 mt-0.5">
                                  {e.time && (
                                    <span className="text-xs text-muted-foreground">
                                      {fmt12(e.time)}
                                      {tzAbbr(e.timezone, e.date) && ` · ${tzAbbr(e.timezone, e.date)}`}
                                      {e.utcISO && ` · ${fmtUtc(e.utcISO)}`}
                                    </span>
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
                                  {handle}
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
                            </div>
                          </DroppableTarget>
                        )}
                      </DraggableItem>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
      </MergeDndContext>

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
      {editingActivity && (
        <ActivityEditModal
          activity={editingActivity}
          onSave={handleEditActivity}
          onClose={() => setEditingActivity(null)}
        />
      )}
    </div>
  );
}
