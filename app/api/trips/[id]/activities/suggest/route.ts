import { auth } from '@/lib/auth';
import { getTrip } from '@/services/db';
import { suggestActivities } from '@/services/claude';
import { filterOpenPlaces } from '@/services/places';

async function getUserId(): Promise<string | null> {
  const session = await auth();
  return (session as { userId?: string })?.userId ?? null;
}

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

  const body = (await request.json()) as { destination?: string; prompt?: string };
  const destination = body.destination ?? trip.destination;
  const startDate = trip.startDate ?? new Date().toISOString().slice(0, 10);
  const endDate = trip.endDate ?? startDate;

  const raw = await suggestActivities(destination, startDate, endDate, body.prompt);
  const suggestions = await filterOpenPlaces(raw, destination);
  return Response.json({ suggestions });
}
