import { withTripAuth } from '@/lib/api';
import { suggestActivities } from '@/services/claude';
import { filterOpenPlaces } from '@/services/places';

export const POST = withTripAuth(async ({ trip, params, request }) => {
  const body = (await request.json()) as { destination?: string; prompt?: string };
  const destination = body.destination ?? trip.destination;
  const startDate = trip.startDate ?? new Date().toISOString().slice(0, 10);
  const endDate = trip.endDate ?? startDate;

  const raw = await suggestActivities(destination, startDate, endDate, body.prompt);
  const suggestions = await filterOpenPlaces(raw, destination);
  return Response.json({ suggestions });
}, { requireOwner: true });
