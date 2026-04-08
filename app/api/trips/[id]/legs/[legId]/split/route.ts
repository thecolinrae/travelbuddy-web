import { withTripAuth, apiError } from '@/lib/api';
import { getLeg, splitLeg } from '@/services/legs';

// POST /api/trips/[id]/legs/[legId]/split
// Body: { atEventId: string }
// Splits the leg into two at atEventId (atEventId becomes the first event of the new leg).
export const POST = withTripAuth(async ({ params, request }) => {
  const { id, legId } = params;
  const leg = await getLeg(legId);
  if (!leg || leg.tripId !== id) return apiError('Leg not found', 404);

  const body = (await request.json()) as { atEventId: string };
  if (!body.atEventId) return apiError('atEventId is required', 400);

  try {
    const [original, newLeg] = await splitLeg(id, legId, body.atEventId);
    return Response.json({ original, newLeg }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Split failed';
    return apiError(msg, 400);
  }
}, { requireOwner: true });
