import { withTripAuth } from '@/lib/api';
import { loadTimeline, saveTimeline } from '@/services/db';
import type { TimelineEvent } from '@/types';

export const GET = withTripAuth(async ({ params }) => {
  const { id } = params;
  const timeline = await loadTimeline(id);
  return Response.json({ data: timeline });
});

export const POST = withTripAuth(async ({ params, request }) => {
  const { id } = params;
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

  return Response.json({ data: newEvent });
}, { requireOwner: true });
