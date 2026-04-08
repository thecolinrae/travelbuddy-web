import { withTripAuth, apiError } from '@/lib/api';
import { shareTrip, unshareTrip, listTripShares } from '@/services/db';

export const GET = withTripAuth(async ({ params }) => {
  const { id } = params;
  const shares = await listTripShares(id);
  return Response.json({
    data: shares.map((s) => ({ ...s, createdAt: s.createdAt.toISOString() })),
  });
}, { requireOwner: true });

export const POST = withTripAuth(async ({ userId, params, request }) => {
  const { id } = params;
  const body = (await request.json()) as { email?: string };
  const email = body.email?.trim().toLowerCase();
  if (!email) return apiError('Missing email', 400);

  await shareTrip(id, userId, email);
  return Response.json({ ok: true });
}, { requireOwner: true });

export const DELETE = withTripAuth(async ({ params, request }) => {
  const { id } = params;
  const body = (await request.json()) as { email?: string };
  const email = body.email?.trim().toLowerCase();
  if (!email) return apiError('Missing email', 400);

  await unshareTrip(id, email);
  return Response.json({ ok: true });
}, { requireOwner: true });
