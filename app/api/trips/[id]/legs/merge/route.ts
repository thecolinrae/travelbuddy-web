import { withTripAuth, apiError } from '@/lib/api';
import { getLeg, mergeLegs } from '@/services/legs';

// POST /api/trips/[id]/legs/merge
// Body: { primaryLegId: string; secondaryLegId: string }
// Merges secondaryLegId into primaryLegId. Secondary is deleted.
export const POST = withTripAuth(async ({ params, request }) => {
  const { id } = params;
  const body = (await request.json()) as { primaryLegId: string; secondaryLegId: string };
  if (!body.primaryLegId || !body.secondaryLegId) {
    return apiError('primaryLegId and secondaryLegId are required', 400);
  }
  if (body.primaryLegId === body.secondaryLegId) {
    return apiError('Cannot merge a leg with itself', 400);
  }

  const [primary, secondary] = await Promise.all([
    getLeg(body.primaryLegId),
    getLeg(body.secondaryLegId),
  ]);
  if (!primary || primary.tripId !== id) return apiError('Primary leg not found', 404);
  if (!secondary || secondary.tripId !== id) return apiError('Secondary leg not found', 404);

  try {
    const merged = await mergeLegs(id, body.primaryLegId, body.secondaryLegId);
    return Response.json({ leg: merged });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Merge failed';
    return apiError(msg, 400);
  }
}, { requireOwner: true });
