import { auth } from '@/lib/auth';
import { getTrip } from '@/services/db';
import { enrichActivity } from '@/services/claude';

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

  const body = (await request.json()) as { name: string; city?: string };
  if (!body.name?.trim()) return Response.json({ error: 'name is required' }, { status: 400 });

  const result = await enrichActivity(body.name.trim(), body.city ?? trip.destination);
  return Response.json(result);
}
