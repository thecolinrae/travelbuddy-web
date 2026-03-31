import { auth } from '@/lib/auth';
import { getTrip } from '@/services/db';
import { listLegsWithEvents, createLeg } from '@/services/legs';

async function getUserId(): Promise<string | null> {
  const session = await auth();
  return (session as { userId?: string })?.userId ?? null;
}

// GET /api/trips/[id]/legs — list all legs with events + unassigned events
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const userId = await getUserId();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const trip = await getTrip(id, userId);
  if (!trip) return Response.json({ error: 'Not found' }, { status: 404 });

  const data = await listLegsWithEvents(id);
  return Response.json(data);
}

// POST /api/trips/[id]/legs — create a new empty leg
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

  const body = (await request.json()) as { name?: string };

  // New leg goes at the end
  const { legs } = await listLegsWithEvents(id);
  const order = legs.length;

  const leg = await createLeg(id, body.name ?? null, order, !!body.name);
  return Response.json({ leg }, { status: 201 });
}
