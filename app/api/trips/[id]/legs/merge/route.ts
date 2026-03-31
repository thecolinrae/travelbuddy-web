import { auth } from '@/lib/auth';
import { getTrip } from '@/services/db';
import { getLeg, mergeLegs } from '@/services/legs';

async function getUserId(): Promise<string | null> {
  const session = await auth();
  return (session as { userId?: string })?.userId ?? null;
}

// POST /api/trips/[id]/legs/merge
// Body: { primaryLegId: string; secondaryLegId: string }
// Merges secondaryLegId into primaryLegId. Secondary is deleted.
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

  const body = (await request.json()) as { primaryLegId: string; secondaryLegId: string };
  if (!body.primaryLegId || !body.secondaryLegId) {
    return Response.json({ error: 'primaryLegId and secondaryLegId are required' }, { status: 400 });
  }
  if (body.primaryLegId === body.secondaryLegId) {
    return Response.json({ error: 'Cannot merge a leg with itself' }, { status: 400 });
  }

  const [primary, secondary] = await Promise.all([
    getLeg(body.primaryLegId),
    getLeg(body.secondaryLegId),
  ]);
  if (!primary || primary.tripId !== id) return Response.json({ error: 'Primary leg not found' }, { status: 404 });
  if (!secondary || secondary.tripId !== id) return Response.json({ error: 'Secondary leg not found' }, { status: 404 });

  try {
    const merged = await mergeLegs(id, body.primaryLegId, body.secondaryLegId);
    return Response.json({ leg: merged });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Merge failed';
    return Response.json({ error: msg }, { status: 400 });
  }
}
