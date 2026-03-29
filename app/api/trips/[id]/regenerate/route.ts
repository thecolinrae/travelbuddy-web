import { auth } from '@/lib/auth';
import { getTrip, loadTimeline, updateTrip } from '@/services/db';
import { generateItinerary } from '@/services/claude';
import { formatTimeline } from '@/services/timeline';

async function getUserId(): Promise<string | null> {
  const session = await auth();
  return (session as { userId?: string })?.userId ?? null;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const userId = await getUserId();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const trip = await getTrip(id, userId);
  if (!trip) return Response.json({ error: 'Not found' }, { status: 404 });
  if (trip.userId !== userId) return Response.json({ error: 'Forbidden' }, { status: 403 });

  const timeline = await loadTimeline(id);
  if (timeline.length === 0) {
    return Response.json({ error: 'No timeline events to generate from' }, { status: 400 });
  }

  const itineraryMd = await generateItinerary(formatTimeline(timeline));
  await updateTrip(id, userId, { itineraryMd });

  return Response.json({ itineraryMd });
}
