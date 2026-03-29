import { auth } from '@/lib/auth';
import { getTrip, loadTimeline, saveTimeline } from '@/services/db';
import type { TimelineEvent } from '@/types';

async function getUserId(): Promise<string | null> {
  const session = await auth();
  return (session as { userId?: string })?.userId ?? null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const userId = await getUserId();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const trip = await getTrip(id, userId);
  if (!trip) return Response.json({ error: 'Not found' }, { status: 404 });
  if (trip.userId !== userId) return Response.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await request.json()) as Omit<TimelineEvent, 'id'>;

  const newEvent: TimelineEvent = {
    ...body,
    id: crypto.randomUUID(),
  } as TimelineEvent;

  const timeline = await loadTimeline(id);
  timeline.push(newEvent);
  // Re-sort by date
  timeline.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  await saveTimeline(id, timeline);

  return Response.json({ event: newEvent });
}
