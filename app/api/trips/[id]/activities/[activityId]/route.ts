import { withTripAuth, apiError } from '@/lib/api';
import { loadActivities, saveActivities } from '@/services/db';
import type { Activity } from '@/types';

export const PATCH = withTripAuth(async ({ trip, params, request }) => {
  const { id, activityId } = params;
  const data = await loadActivities(id);
  if (!data) return apiError('No activities', 404);

  const body = (await request.json()) as Partial<
    Pick<Activity, 'scheduledDate' | 'scheduledTime' | 'durationMinutes'>
  >;

  const updated = data.savedActivities.map((a) =>
    a.id === activityId ? { ...a, ...body } : a,
  );

  await saveActivities(id, data.destination ?? trip.destination, updated);

  const activity = updated.find((a) => a.id === activityId);
  return Response.json({ activity });
}, { requireOwner: true });

export const DELETE = withTripAuth(async ({ trip, params }) => {
  const { id, activityId } = params;
  const data = await loadActivities(id);
  if (!data) return apiError('No activities', 404);

  const updated = data.savedActivities.filter((a) => a.id !== activityId);
  await saveActivities(id, data.destination ?? trip.destination, updated);
  return Response.json({ ok: true });
}, { requireOwner: true });
