import { auth } from '@/lib/auth';
import { getTrip, loadActivities, saveActivities, loadTimeline, saveTimeline } from '@/services/db';
import type { ActivityEvent } from '@/types';

interface MergeBody {
  activityId: string;
  eventId: string;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const userId = (session as { userId?: string })?.userId;
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: tripId } = await params;
  const trip = await getTrip(tripId, userId);
  if (!trip) return Response.json({ error: 'Not found' }, { status: 404 });
  if (trip.userId !== userId) return Response.json({ error: 'Forbidden' }, { status: 403 });

  const { activityId, eventId } = (await request.json()) as MergeBody;

  const [activitiesData, timeline] = await Promise.all([
    loadActivities(tripId),
    loadTimeline(tripId),
  ]);

  const activities = activitiesData?.savedActivities ?? [];
  const activityIdx = activities.findIndex((a) => a.id === activityId);
  if (activityIdx === -1) return Response.json({ error: 'Activity not found' }, { status: 404 });

  const eventIdx = timeline.findIndex((e) => e.id === eventId);
  if (eventIdx === -1) return Response.json({ error: 'Event not found' }, { status: 404 });

  const event = timeline[eventIdx];
  if (event.type !== 'activity') {
    return Response.json({ error: 'Event is not an activity' }, { status: 400 });
  }

  const activity = activities[activityIdx];
  if (activity.linkedEventId) {
    return Response.json({ error: 'Activity is already linked to an event' }, { status: 400 });
  }
  if ((event as ActivityEvent).linkedActivityId) {
    return Response.json({ error: 'Event is already linked to an activity' }, { status: 400 });
  }

  activities[activityIdx] = { ...activity, linkedEventId: eventId };
  timeline[eventIdx] = { ...event, linkedActivityId: activityId } as ActivityEvent;

  await Promise.all([
    saveActivities(tripId, activitiesData?.destination ?? trip.destination, activities),
    saveTimeline(tripId, timeline),
  ]);

  return Response.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const userId = (session as { userId?: string })?.userId;
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: tripId } = await params;
  const trip = await getTrip(tripId, userId);
  if (!trip) return Response.json({ error: 'Not found' }, { status: 404 });
  if (trip.userId !== userId) return Response.json({ error: 'Forbidden' }, { status: 403 });

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
}
