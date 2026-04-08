import { withTripAuth, apiError } from '@/lib/api';
import { enrichActivity } from '@/services/claude';

export const POST = withTripAuth(async ({ trip, params, request }) => {
  const body = (await request.json()) as { name: string; city?: string };
  if (!body.name?.trim()) return apiError('name is required', 400);

  const result = await enrichActivity(body.name.trim(), body.city ?? trip.destination);
  return Response.json(result);
}, { requireOwner: true });
