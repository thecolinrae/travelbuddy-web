import { auth } from '@/lib/auth';
import { getTrip } from '@/services/db';
import { fetchDestinationPhotos } from '@/services/photos';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  const userId = (session as { userId?: string })?.userId;
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const trip = await getTrip(id, userId);
  if (!trip) return Response.json({ error: 'Not found' }, { status: 404 });

  const photos = await fetchDestinationPhotos(trip.destination, 4);
  return Response.json({ photos });
}
