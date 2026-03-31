import { auth } from '@/lib/auth';
import { getTrip } from '@/services/db';
import { getLeg, updateLeg, deleteLeg } from '@/services/legs';

async function getUserId(): Promise<string | null> {
  const session = await auth();
  return (session as { userId?: string })?.userId ?? null;
}

// PATCH /api/trips/[id]/legs/[legId] — rename or reorder a leg
export async function PATCH(
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

  const body = (await request.json()) as { name?: string; order?: number };

  const updated = await updateLeg(legId, {
    ...(body.name !== undefined && { name: body.name, nameIsCustom: true }),
    ...(body.order !== undefined && { order: body.order }),
  });

  return Response.json({ leg: updated });
}

// DELETE /api/trips/[id]/legs/[legId] — delete leg (events become unassigned)
export async function DELETE(
  _request: Request,
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

  await deleteLeg(legId);
  return Response.json({ ok: true });
}
