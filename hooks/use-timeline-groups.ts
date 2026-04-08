import { useMemo } from 'react';
import type { TimelineEvent, ExpenseEvent, TransportDepartureEvent, TransportArrivalEvent, ActivityEvent, Activity } from '@/types';

export function eventSortMs(e: TimelineEvent): number {
  if (e.utcISO) return new Date(e.utcISO).getTime();
  if (e.date && e.time) return new Date(`${e.date}T${e.time}`).getTime();
  if (e.date) return new Date(`${e.date}T23:59:59`).getTime();
  return Number.MAX_SAFE_INTEGER;
}

export function activitySortMs(a: Activity): number {
  if (a.scheduledDate && a.scheduledTime) return new Date(`${a.scheduledDate}T${a.scheduledTime}`).getTime();
  if (a.scheduledDate) return new Date(`${a.scheduledDate}T23:59:59`).getTime();
  return Number.MAX_SAFE_INTEGER;
}

export interface TimelineGroups {
  days: string[];
  byDate: Map<string, TimelineEvent[]>;
  activitiesByDate: Map<string, Activity[]>;
  linkedExpenses: Map<string, ExpenseEvent[]>;
  scheduledActivities: Activity[];
  unlinkedActivityEvents: ActivityEvent[];
  unlinkedActivities: Activity[];
  getMissingCounterpart: (e: TimelineEvent) => 'arrival' | 'departure' | null;
}

export function useTimelineGroups(
  timeline: TimelineEvent[],
  activities: Activity[],
): TimelineGroups {
  return useMemo(() => {
    // Linked expenses keyed by parent event id
    const linkedExpenses = new Map<string, ExpenseEvent[]>();
    for (const e of timeline) {
      if (e.type !== 'expense') continue;
      const exp = e as ExpenseEvent;
      if (!exp.linkedEventId) continue;
      const bucket = linkedExpenses.get(exp.linkedEventId) ?? [];
      bucket.push(exp);
      linkedExpenses.set(exp.linkedEventId, bucket);
    }

    // Transport journey pairs (to detect missing counterparts)
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
      if (!e.journeyId) return e.subtype === 'departure' ? 'arrival' : 'departure';
      const j = transportJourneys.get(e.journeyId);
      if (!j) return null;
      if (e.subtype === 'departure' && !j.arr) return 'arrival';
      if (e.subtype === 'arrival' && !j.dep) return 'departure';
      return null;
    }

    // Group non-expense timeline events by date
    const byDate = new Map<string, TimelineEvent[]>();
    for (const e of timeline) {
      if (e.type === 'expense') continue;
      const bucket = byDate.get(e.date) ?? [];
      bucket.push(e);
      byDate.set(e.date, bucket);
    }

    // Scheduled activities not already absorbed by an ActivityEvent
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
      const bucket = activitiesByDate.get(a.scheduledDate!) ?? [];
      bucket.push(a);
      activitiesByDate.set(a.scheduledDate!, bucket);
    }

    const allDates = new Set([...byDate.keys(), ...activitiesByDate.keys()]);
    const days = [...allDates].sort();

    const unlinkedActivityEvents = timeline.filter(
      (e): e is ActivityEvent => e.type === 'activity' && !e.linkedActivityId,
    );
    const unlinkedActivities = scheduledActivities.filter((a) => !a.linkedEventId);

    return {
      days,
      byDate,
      activitiesByDate,
      linkedExpenses,
      scheduledActivities,
      unlinkedActivityEvents,
      unlinkedActivities,
      getMissingCounterpart,
    };
  }, [timeline, activities]);
}
