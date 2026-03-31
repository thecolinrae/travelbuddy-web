'use client';

import { useState, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LegCard } from './LegCard';
import { MergeAffordance } from './MergeAffordance';
import { UnassignedSection } from './UnassignedSection';
import type { LegWithEvents } from '@/services/legs';
import type { TimelineEvent } from '@/types';

interface Props {
  tripId: string;
  initialLegs: LegWithEvents[];
  initialUnassigned: TimelineEvent[];
  isOwner: boolean;
}

export function TransportationView({ tripId, initialLegs, initialUnassigned, isOwner }: Props) {
  const [legs, setLegs] = useState<LegWithEvents[]>(initialLegs);
  const [unassigned, setUnassigned] = useState<TimelineEvent[]>(initialUnassigned);

  // Reload legs + unassigned from server
  const refresh = useCallback(async () => {
    const res = await fetch(`/api/trips/${tripId}/legs`);
    if (!res.ok) return;
    const data = await res.json() as { legs: LegWithEvents[]; unassigned: TimelineEvent[] };
    setLegs(data.legs);
    setUnassigned(data.unassigned);
  }, [tripId]);

  async function handleSplit(legId: string, atEventId: string) {
    // Optimistic: split the leg in local state
    const legIdx = legs.findIndex((l) => l.id === legId);
    if (legIdx === -1) return;
    const leg = legs[legIdx];
    const splitIdx = leg.events.findIndex((e) => e.id === atEventId);
    if (splitIdx <= 0) return;

    const before = leg.events.slice(0, splitIdx);
    const after = leg.events.slice(splitIdx);
    const tempNewLeg: LegWithEvents = {
      ...leg,
      id: `temp-${Date.now()}`,
      events: after,
      order: leg.order + 1,
    };
    const updatedOrig = { ...leg, events: before };
    const newLegs = [
      ...legs.slice(0, legIdx),
      updatedOrig,
      tempNewLeg,
      ...legs.slice(legIdx + 1).map((l) => ({ ...l, order: l.order + 1 })),
    ];
    setLegs(newLegs);

    const res = await fetch(`/api/trips/${tripId}/legs/${legId}/split`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ atEventId }),
    });
    if (!res.ok) {
      setLegs(legs); // rollback
      return;
    }
    await refresh();
  }

  async function handleMerge(primaryLegId: string, secondaryLegId: string) {
    // Optimistic: merge local state
    const primaryIdx = legs.findIndex((l) => l.id === primaryLegId);
    const secondaryIdx = legs.findIndex((l) => l.id === secondaryLegId);
    if (primaryIdx === -1 || secondaryIdx === -1) return;

    const merged: LegWithEvents = {
      ...legs[primaryIdx],
      events: [...legs[primaryIdx].events, ...legs[secondaryIdx].events].sort(
        (a, b) => (a.utcISO ?? a.date ?? '').localeCompare(b.utcISO ?? b.date ?? ''),
      ),
    };
    setLegs(legs.filter((l) => l.id !== secondaryLegId).map((l) => l.id === primaryLegId ? merged : l));

    const res = await fetch(`/api/trips/${tripId}/legs/merge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ primaryLegId, secondaryLegId }),
    });
    if (!res.ok) {
      setLegs(legs); // rollback
      return;
    }
    await refresh();
  }

  async function handleRename(legId: string, name: string) {
    setLegs(legs.map((l) => l.id === legId ? { ...l, name, nameIsCustom: true } : l));
    await fetch(`/api/trips/${tripId}/legs/${legId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
  }

  async function handleDeleteLeg(legId: string) {
    const leg = legs.find((l) => l.id === legId);
    if (!leg) return;
    setLegs(legs.filter((l) => l.id !== legId));
    setUnassigned([...unassigned, ...leg.events]);
    await fetch(`/api/trips/${tripId}/legs/${legId}`, { method: 'DELETE' });
    await refresh();
  }

  async function handleAssign(eventId: string, legId: string | null) {
    const event =
      unassigned.find((e) => e.id === eventId) ??
      legs.flatMap((l) => l.events).find((e) => e.id === eventId);
    if (!event) return;

    // Only apply optimistic update if the target leg is already in local state.
    // If it isn't (e.g. just created via "New leg"), skip the optimistic step and
    // let the refresh below reconcile — avoids the event disappearing from the UI.
    const targetLegKnown = legId === null || legs.some((l) => l.id === legId);
    if (targetLegKnown) {
      if (legId === null) {
        setLegs(legs.map((l) => ({ ...l, events: l.events.filter((e) => e.id !== eventId) })));
        setUnassigned([...unassigned, event]);
      } else {
        setUnassigned(unassigned.filter((e) => e.id !== eventId));
        setLegs(
          legs.map((l) => {
            const without = l.events.filter((e) => e.id !== eventId);
            if (l.id === legId) return { ...l, events: [...without, event].sort((a, b) => (a.utcISO ?? a.date ?? '').localeCompare(b.utcISO ?? b.date ?? '')) };
            return { ...l, events: without };
          }),
        );
      }
    }

    await fetch(`/api/trips/${tripId}/timeline/${eventId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ legId }),
    });

    // Always sync from server — ensures consistency regardless of whether the
    // optimistic update was applied and handles the "new leg" case above.
    await refresh();
  }

  async function handleNewLeg() {
    const res = await fetch(`/api/trips/${tripId}/legs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!res.ok) return;
    await refresh();
  }

  if (legs.length === 0 && unassigned.length === 0) {
    return (
      <div className="py-16 flex flex-col items-center gap-4 text-center">
        <p className="font-semibold text-text-base">No transport events yet</p>
        <p className="type-caption max-w-xs">
          Import a flight confirmation or booking to see transportation here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {legs.map((leg, i) => (
        <div key={leg.id}>
          <LegCard
            leg={leg}
            tripId={tripId}
            isOwner={isOwner}
            onSplit={handleSplit}
            onRename={handleRename}
            onDelete={handleDeleteLeg}
            onAssignEvent={(eventId) => handleAssign(eventId, null)}
            legOptions={legs}
          />
          {isOwner && i < legs.length - 1 && (
            <MergeAffordance
              onMerge={() => handleMerge(leg.id, legs[i + 1].id)}
            />
          )}
        </div>
      ))}

      {isOwner && (
        <div className="pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleNewLeg}
            className="gap-1.5 text-text-muted hover:text-text-base"
          >
            <Plus className="h-4 w-4" />
            New leg
          </Button>
        </div>
      )}

      {unassigned.length > 0 && (
        <UnassignedSection
          events={unassigned}
          legOptions={legs}
          isOwner={isOwner}
          onAssign={handleAssign}
          tripId={tripId}
        />
      )}
    </div>
  );
}
