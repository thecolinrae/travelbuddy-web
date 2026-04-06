import { auth } from '@/lib/auth';
import { getTrip, loadActivities, saveActivities } from '@/services/db';
import type { Activity } from '@/types';

async function getUserId(): Promise<string | null> {
  const session = await auth();
  return (session as { userId?: string })?.userId ?? null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; activityId: string }> },
) {
  const { id, activityId } = await params;
  const userId = await getUserId();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const trip = await getTrip(id, userId);
  if (!trip) return Response.json({ error: 'Not found' }, { status: 404 });
  if (trip.userId !== userId) return Response.json({ error: 'Forbidden' }, { status: 403 });

  const data = await loadActivities(id);
  if (!data) return Response.json({ error: 'No activities' }, { status: 404 });

  const body = (await request.json()) as Partial<
    Pick<Activity, 'scheduledDate' | 'scheduledTime' | 'durationMinutes'>
  >;

  const updated = data.savedActivities.map((a) =>
    a.id === activityId ? { ...a, ...body } : a,
  );

  await saveActivities(id, data.destination ?? trip.destination, updated);

  const activity = updated.find((a) => a.id === activityId);
  return Response.json({ activity });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; activityId: string }> },
) {
  const { id, activityId } = await params;
  const userId = await getUserId();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const trip = await getTrip(id, userId);
  if (!trip) return Response.json({ error: 'Not found' }, { status: 404 });
  if (trip.userId !== userId) return Response.json({ error: 'Forbidden' }, { status: 403 });

  const data = await loadActivities(id);
  if (!data) return Response.json({ error: 'No activities' }, { status: 404 });

  const updated = data.savedActivities.filter((a) => a.id !== activityId);
  await saveActivities(id, data.destination ?? trip.destination, updated);
  return Response.json({ ok: true });
}
