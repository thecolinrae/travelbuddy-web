import { auth } from '@/lib/auth';
import { getTrip, loadTimeline, saveTimeline } from '@/services/db';
import { assignEventToLeg } from '@/services/legs';
import { prisma } from '@/lib/prisma';
import type { TimelineEvent } from '@/types';

async function getUserId(): Promise<string | null> {
  const session = await auth();
  return (session as { userId?: string })?.userId ?? null;
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; eventId: string }> },
) {
  const { id, eventId } = await params;
  const userId = await getUserId();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const trip = await getTrip(id, userId);
  if (!trip) return Response.json({ error: 'Not found' }, { status: 404 });
  if (trip.userId !== userId) return Response.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await request.json()) as Partial<TimelineEvent> & { legId?: string | null };

  // If only legId is being updated, do a targeted DB update without a full timeline rewrite.
  // Use a raw query to match by either DB pk or data->>'id' (handles rows created before
  // the id-alignment fix where DB pk != event.id).
  const keys = Object.keys(body);
  if (keys.length === 1 && 'legId' in body) {
    const rows = await prisma.$queryRaw<Array<{ data: unknown }>>`
      SELECT data FROM "TimelineEvent"
      WHERE "tripId" = ${id} AND (id = ${eventId} OR data->>'id' = ${eventId})
      LIMIT 1
    `;
    if (rows.length === 0) return Response.json({ error: 'Event not found' }, { status: 404 });
    const eventData = rows[0].data as unknown as TimelineEvent;
    if (eventData.type !== 'flight' && eventData.type !== 'otherTransportation') {
      return Response.json({ error: 'Only transport events can be assigned to legs' }, { status: 400 });
    }
    await assignEventToLeg(id, eventId, body.legId ?? null);
    return Response.json({ ok: true });
  }

  const timeline = await loadTimeline(id);
  const idx = timeline.findIndex((e) => e.id === eventId);
  if (idx === -1) return Response.json({ error: 'Event not found' }, { status: 404 });

  timeline[idx] = { ...timeline[idx], ...body, id: eventId } as TimelineEvent;
  timeline.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  await saveTimeline(id, timeline);

  return Response.json({ event: timeline[idx] });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; eventId: string }> },
) {
  const { id, eventId } = await params;
  const userId = await getUserId();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const trip = await getTrip(id, userId);
  if (!trip) return Response.json({ error: 'Not found' }, { status: 404 });
  if (trip.userId !== userId) return Response.json({ error: 'Forbidden' }, { status: 403 });

  const timeline = await loadTimeline(id);
  const filtered = timeline.filter((e) => e.id !== eventId);
  if (filtered.length === timeline.length) {
    return Response.json({ error: 'Event not found' }, { status: 404 });
  }
  await saveTimeline(id, filtered);

  return Response.json({ ok: true });
}
