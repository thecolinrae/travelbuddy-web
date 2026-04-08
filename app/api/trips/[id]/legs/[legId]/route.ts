import { withTripAuth, apiError } from '@/lib/api';
import { getLeg, updateLeg, deleteLeg } from '@/services/legs';

// PATCH /api/trips/[id]/legs/[legId] — rename or reorder a leg
export const PATCH = withTripAuth(async ({ params, request }) => {
  const { id, legId } = params;
  const leg = await getLeg(legId);
  if (!leg || leg.tripId !== id) return apiError('Leg not found', 404);

  const body = (await request.json()) as { name?: string; order?: number };

  const updated = await updateLeg(legId, {
    ...(body.name !== undefined && { name: body.name, nameIsCustom: true }),
    ...(body.order !== undefined && { order: body.order }),
  });

  return Response.json({ leg: updated });
}, { requireOwner: true });

// DELETE /api/trips/[id]/legs/[legId] — delete leg (events become unassigned)
export const DELETE = withTripAuth(async ({ params }) => {
  const { id, legId } = params;
  const leg = await getLeg(legId);
  if (!leg || leg.tripId !== id) return apiError('Leg not found', 404);

  await deleteLeg(legId);
  return Response.json({ ok: true });
}, { requireOwner: true });
