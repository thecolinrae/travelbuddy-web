import { withTripAuth } from '@/lib/api';
import { updateTrip } from '@/services/db';

export const PUT = withTripAuth(async ({ userId, params, request }) => {
  const { id } = params;
  const body = (await request.json()) as { notes: string };
  await updateTrip(id, userId, { notes: body.notes });

  return Response.json({ ok: true });
}, { requireOwner: true });
