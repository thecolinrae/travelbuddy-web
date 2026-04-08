import { useMutation, useQueryClient } from '@tanstack/react-query';
import { tripKeys } from '@/lib/query-keys';
import type { TimelineEvent, Activity, BudgetItemCategory } from '@/types';

async function apiFetch(url: string, options: RequestInit): Promise<unknown> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

export function useDeleteTimelineEvent(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (eventId: string) =>
      apiFetch(`/api/trips/${tripId}/timeline/${eventId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: tripKeys.timeline(tripId) }),
  });
}

export function useSaveTimelineEvent(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (event: Partial<TimelineEvent> & { id?: string }) => {
      if (event.id) {
        return apiFetch(`/api/trips/${tripId}/timeline/${event.id}`, {
          method: 'PUT',
          body: JSON.stringify(event),
        });
      }
      return apiFetch(`/api/trips/${tripId}/timeline`, {
        method: 'POST',
        body: JSON.stringify(event),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: tripKeys.timeline(tripId) }),
  });
}

export function useAssignLeg(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, legId }: { eventId: string; legId: string | null }) =>
      apiFetch(`/api/trips/${tripId}/timeline/${eventId}`, {
        method: 'PUT',
        body: JSON.stringify({ legId }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tripKeys.timeline(tripId) });
      qc.invalidateQueries({ queryKey: tripKeys.legs(tripId) });
    },
  });
}

// ─── Expenses ─────────────────────────────────────────────────────────────────

export function useDeleteExpense(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (expenseId: string) =>
      apiFetch(`/api/trips/${tripId}/expenses/${expenseId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: tripKeys.timeline(tripId) }),
  });
}

// ─── Activities ───────────────────────────────────────────────────────────────

export function useSaveActivities(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ activities, destination }: { activities: Activity[]; destination?: string }) =>
      apiFetch(`/api/trips/${tripId}/activities`, {
        method: 'PUT',
        body: JSON.stringify({ activities, destination }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: tripKeys.activities(tripId) }),
  });
}

export function useMergeActivities(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ activityId, eventId }: { activityId: string; eventId: string }) =>
      apiFetch(`/api/trips/${tripId}/activities/merge`, {
        method: 'POST',
        body: JSON.stringify({ activityId, eventId }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tripKeys.timeline(tripId) });
      qc.invalidateQueries({ queryKey: tripKeys.activities(tripId) });
    },
  });
}

export function useUnmergeActivities(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ activityId, eventId }: { activityId: string; eventId: string }) =>
      apiFetch(`/api/trips/${tripId}/activities/merge`, {
        method: 'DELETE',
        body: JSON.stringify({ activityId, eventId }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tripKeys.timeline(tripId) });
      qc.invalidateQueries({ queryKey: tripKeys.activities(tripId) });
    },
  });
}

// ─── Budget & trip metadata ───────────────────────────────────────────────────

export function useSaveBudget(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      budgetGoal,
      categoryGoals,
    }: {
      budgetGoal: number | null;
      categoryGoals: Partial<Record<BudgetItemCategory, number>> | null;
    }) =>
      apiFetch(`/api/trips/${tripId}/budget`, {
        method: 'PATCH',
        body: JSON.stringify({ budgetGoal, categoryGoals }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: tripKeys.detail(tripId) }),
  });
}

export function useSaveNotes(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (notes: string) =>
      apiFetch(`/api/trips/${tripId}/notes`, {
        method: 'PUT',
        body: JSON.stringify({ notes }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: tripKeys.detail(tripId) }),
  });
}

export function useUpdateTrip(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name?: string;
      destination?: string;
      destinations?: string[];
      startDate?: string | null;
      endDate?: string | null;
      coverEmoji?: string;
      coverPhotoUrl?: string | null;
      status?: string;
      notes?: string | null;
    }) =>
      apiFetch(`/api/trips/${tripId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: tripKeys.detail(tripId) }),
  });
}

export function useDeleteTrip(tripId: string) {
  return useMutation({
    mutationFn: () => apiFetch(`/api/trips/${tripId}`, { method: 'DELETE' }),
  });
}

// ─── Notifications ────────────────────────────────────────────────────────────

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch('/api/notifications', { method: 'PATCH' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: tripKeys.notifications }),
  });
}
