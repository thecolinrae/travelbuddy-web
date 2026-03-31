import { auth } from '@/lib/auth';
import { getTrip } from '@/services/db';
import { getLeg, splitLeg } from '@/services/legs';

async function getUserId(): Promise<string | null> {
  const session = await auth();
  return (session as { userId?: string })?.userId ?? null;
}

// POST /api/trips/[id]/legs/[legId]/split
// Body: { atEventId: string }
// Splits the leg into two at atEventId (atEventId becomes the first event of the new leg).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; legId: string }> },
) {
  const { id, legId } = await params;
  const userId = await getUserId();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const trip = await getTrip(id, userId);
  if (!trip) return Response.json({ error: 'Not found' }, { status: 404 });
  if (trip.userId !== userId) return Response.json({ error: 'Forbidden' }, { status: 403 });

  const leg = await getLeg(legId);
  if (!leg || leg.tripId !== id) return Response.json({ error: 'Leg not found' }, { status: 404 });

  const body = (await request.json()) as { atEventId: string };
  if (!body.atEventId) return Response.json({ error: 'atEventId is required' }, { status: 400 });

  try {
    const [original, newLeg] = await splitLeg(id, legId, body.atEventId);
    return Response.json({ original, newLeg }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Split failed';
    return Response.json({ error: msg }, { status: 400 });
  }
}
