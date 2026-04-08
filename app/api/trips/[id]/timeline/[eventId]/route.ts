import { withTripAuth, apiError } from '@/lib/api';
import { loadTimeline, saveTimeline, getTimelineEventByDataId } from '@/services/db';
import { assignEventToLeg } from '@/services/legs';
import type { TimelineEvent } from '@/types';

export const PUT = withTripAuth(async ({ params, request }) => {
  const { id, eventId } = params;
  const body = (await request.json()) as Partial<TimelineEvent> & { legId?: string | null };

  // If only legId is being updated, do a targeted DB update without a full timeline rewrite.
  // Use a raw query to match by either DB pk or data->>'id' (handles rows created before
  // the id-alignment fix where DB pk != event.id).
  const keys = Object.keys(body);
  if (keys.length === 1 && 'legId' in body) {
    const eventData = await getTimelineEventByDataId(id, eventId);
    if (!eventData) return apiError('Event not found', 404);
    if (eventData.type !== 'flight' && eventData.type !== 'otherTransportation') {
      return apiError('Only transport events can be assigned to legs', 400);
    }
    await assignEventToLeg(id, eventId, body.legId ?? null);
    return Response.json({ ok: true });
  }

  const timeline = await loadTimeline(id);
  const idx = timeline.findIndex((e) => e.id === eventId);
  if (idx === -1) return apiError('Event not found', 404);

  timeline[idx] = { ...timeline[idx], ...body, id: eventId } as TimelineEvent;
  timeline.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  await saveTimeline(id, timeline);

  return Response.json({ event: timeline[idx] });
}, { requireOwner: true });

export const DELETE = withTripAuth(async ({ params }) => {
  const { id, eventId } = params;
  const timeline = await loadTimeline(id);
  const filtered = timeline.filter((e) => e.id !== eventId);
  if (filtered.length === timeline.length) {
    return apiError('Event not found', 404);
  }
  await saveTimeline(id, filtered);

  return Response.json({ ok: true });
}, { requireOwner: true });
