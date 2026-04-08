import { withTripAuth, apiError } from '@/lib/api';
import { loadActivities, saveActivities, loadTimeline, saveTimeline } from '@/services/db';
import type { ActivityEvent } from '@/types';

interface MergeBody {
  activityId: string;
  eventId: string;
}

export const POST = withTripAuth(async ({ trip, params, request }) => {
  const { id: tripId } = params;
  const { activityId, eventId } = (await request.json()) as MergeBody;

  const [activitiesData, timeline] = await Promise.all([
    loadActivities(tripId),
    loadTimeline(tripId),
  ]);

  const activities = activitiesData?.savedActivities ?? [];
  const activityIdx = activities.findIndex((a) => a.id === activityId);
  if (activityIdx === -1) return apiError('Activity not found', 404);

  const eventIdx = timeline.findIndex((e) => e.id === eventId);
  if (eventIdx === -1) return apiError('Event not found', 404);

  const event = timeline[eventIdx];
  if (event.type !== 'activity') {
    return apiError('Event is not an activity', 400);
  }

  const activity = activities[activityIdx];
  if (activity.linkedEventId) {
    return apiError('Activity is already linked to an event', 400);
  }
  if ((event as ActivityEvent).linkedActivityId) {
    return apiError('Event is already linked to an activity', 400);
  }

  activities[activityIdx] = { ...activity, linkedEventId: eventId };
  timeline[eventIdx] = { ...event, linkedActivityId: activityId } as ActivityEvent;

  await Promise.all([
    saveActivities(tripId, activitiesData?.destination ?? trip.destination, activities),
    saveTimeline(tripId, timeline),
  ]);

  return Response.json({ ok: true });
}, { requireOwner: true });

export const DELETE = withTripAuth(async ({ trip, params, request }) => {
  const { id: tripId } = params;
  const { activityId, eventId } = (await request.json()) as MergeBody;

  const [activitiesData, timeline] = await Promise.all([
    loadActivities(tripId),
    loadTimeline(tripId),
  ]);

  const activities = activitiesData?.savedActivities ?? [];
  const activityIdx = activities.findIndex((a) => a.id === activityId);
  const eventIdx = timeline.findIndex((e) => e.id === eventId);

  if (activityIdx !== -1) {
    const { linkedEventId: _removed, ...rest } = activities[activityIdx];
    activities[activityIdx] = rest;
  }
  if (eventIdx !== -1) {
    const ev = timeline[eventIdx] as ActivityEvent;
    const { linkedActivityId: _removed, ...rest } = ev;
    timeline[eventIdx] = rest as ActivityEvent;
  }

  await Promise.all([
    saveActivities(tripId, activitiesData?.destination ?? trip.destination, activities),
    saveTimeline(tripId, timeline),
  ]);

  return Response.json({ ok: true });
}, { requireOwner: true });
