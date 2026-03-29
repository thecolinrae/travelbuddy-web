import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getArtifactUrl } from '@/services/storage';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  const userId = (session as { userId?: string })?.userId;
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  // Verify the artifact belongs to a trip the user has access to
  const artifact = await prisma.artifact.findUnique({
    where: { id },
    include: {
      trip: {
        select: {
          userId: true,
          shares: { where: { sharedWithUserId: userId }, select: { id: true } },
        },
      },
    },
  });

  if (!artifact) return Response.json({ error: 'Not found' }, { status: 404 });
  const isOwner = artifact.trip.userId === userId;
  const isShared = artifact.trip.shares.length > 0;
  if (!isOwner && !isShared) return Response.json({ error: 'Forbidden' }, { status: 403 });

  const url = await getArtifactUrl(artifact.storagePath);
  return Response.json({ url });
}
