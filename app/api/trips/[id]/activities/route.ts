import { withTripAuth } from '@/lib/api';
import { loadActivities, saveActivities } from '@/services/db';
import type { Activity } from '@/types';

export const GET = withTripAuth(async ({ trip, params }) => {
  const { id } = params;
  const data = await loadActivities(id);
  return Response.json({ data: data?.savedActivities ?? [] });
});

export const PUT = withTripAuth(async ({ trip, params, request }) => {
  const { id } = params;
  const body = (await request.json()) as { activities: Activity[]; destination?: string };

  await saveActivities(id, body.destination ?? trip.destination, body.activities);
  return Response.json({ ok: true });
}, { requireOwner: true });
