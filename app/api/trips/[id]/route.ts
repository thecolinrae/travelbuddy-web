import { auth } from '@/lib/auth';
import { getTrip, updateTrip, deleteTrip } from '@/services/db';

async function getUserId(): Promise<string | null> {
  const session = await auth();
  return (session as { userId?: string })?.userId ?? null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const userId = await getUserId();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const trip = await getTrip(id, userId);
  if (!trip) return Response.json({ error: 'Not found' }, { status: 404 });
  if (trip.userId !== userId) return Response.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await request.json()) as {
    name?: string;
    destination?: string;
    destinations?: string[];
    startDate?: string;
    endDate?: string;
    coverEmoji?: string;
    coverPhotoUrl?: string | null;
    status?: string;
    notes?: string | null;
  };

  const updateData = {
    ...body,
    startDate: body.startDate || undefined,
    endDate: body.endDate || undefined,
  };
  const updated = await updateTrip(id, userId, updateData);
  return Response.json({ trip: updated });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const userId = await getUserId();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const trip = await getTrip(id, userId);
  if (!trip) return Response.json({ error: 'Not found' }, { status: 404 });
  if (trip.userId !== userId) return Response.json({ error: 'Forbidden' }, { status: 403 });

  await deleteTrip(id, userId);
  return Response.json({ ok: true });
}
