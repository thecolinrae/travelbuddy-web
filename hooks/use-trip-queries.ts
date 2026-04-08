import { useQuery } from '@tanstack/react-query';
import { tripKeys } from '@/lib/query-keys';
import type { TimelineEvent, Activity, BudgetItemCategory } from '@/types';

// Shape returned by GET /api/trips/[id]
export interface TripData {
  id: string;
  name: string;
  destination: string;
  destinations: string[];
  startDate: string | null;
  endDate: string | null;
  status: string;
  coverEmoji: string;
  coverPhotoUrl: string | null;
  itineraryMd: string | null;
  notes: string | null;
  budgetGoal: number | null;
  categoryGoals: Partial<Record<BudgetItemCategory, number>> | null;
  preferredCurrency: string;
}

interface LegSummary {
  id: string;
  name: string | null;
}

interface LegsResponse {
  legs: { id: string; name: string; events: TimelineEvent[] }[];
  unassigned: TimelineEvent[];
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export function useTrip(tripId: string, initialData?: TripData) {
  return useQuery({
    queryKey: tripKeys.detail(tripId),
    queryFn: () =>
      fetchJson<{ data: TripData }>(`/api/trips/${tripId}`).then((r) => r.data),
    initialData,
  });
}

export function useTripTimeline(tripId: string, initialData?: TimelineEvent[]) {
  return useQuery({
    queryKey: tripKeys.timeline(tripId),
    queryFn: () =>
      fetchJson<{ data: TimelineEvent[] }>(`/api/trips/${tripId}/timeline`).then((r) => r.data),
    initialData,
  });
}

export function useTripActivities(tripId: string, initialData?: Activity[]) {
  return useQuery({
    queryKey: tripKeys.activities(tripId),
    queryFn: () =>
      fetchJson<{ data: Activity[] }>(`/api/trips/${tripId}/activities`).then((r) => r.data),
    initialData,
  });
}

export function useTripLegs(tripId: string, initialData?: LegSummary[]) {
  return useQuery({
    queryKey: tripKeys.legs(tripId),
    queryFn: () =>
      fetchJson<LegsResponse>(`/api/trips/${tripId}/legs`).then((r) =>
        r.legs.map((l) => ({ id: l.id, name: l.name })),
      ),
    initialData,
  });
}

export interface NotificationTrip { id: string; name: string; }
export interface Notification {
  id: string;
  type: 'activities_generating' | 'activities_ready';
  read: boolean;
  createdAt: string;
  trip: NotificationTrip;
}

export function useNotifications() {
  return useQuery({
    queryKey: tripKeys.notifications,
    queryFn: () =>
      fetchJson<{ data: Notification[]; unreadCount: number }>('/api/notifications'),
    refetchInterval: 30_000,
  });
}
