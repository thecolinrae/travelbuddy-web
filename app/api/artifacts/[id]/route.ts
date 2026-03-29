import { auth } from '@/lib/auth';
import { getTrip, getArtifact, deleteArtifactRecord } from '@/services/db';
import { deleteArtifact } from '@/services/storage';

async function getUserId(): Promise<string | null> {
  const session = await auth();
  return (session as { userId?: string })?.userId ?? null;
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const userId = await getUserId();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const artifact = await getArtifact(id);
  if (!artifact) return Response.json({ error: 'Not found' }, { status: 404 });

  // Verify ownership via the trip
  const trip = await getTrip(artifact.tripId, userId);
  if (!trip) return Response.json({ error: 'Not found' }, { status: 404 });
  if (trip.userId !== userId) return Response.json({ error: 'Forbidden' }, { status: 403 });

  // Delete from S3 then DB
  await deleteArtifact(artifact.storagePath);
  await deleteArtifactRecord(id);

  return Response.json({ ok: true });
}
