import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

function getS3Client() {
  return new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? 'us-east-1',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY!,
      secretAccessKey: process.env.S3_SECRET_KEY!,
    },
    forcePathStyle: true,
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  const userId = (session as { userId?: string })?.userId;
  if (!userId) return new Response('Unauthorized', { status: 401 });

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

  if (!artifact) return new Response('Not found', { status: 404 });
  const isOwner = artifact.trip.userId === userId;
  const isShared = artifact.trip.shares.length > 0;
  if (!isOwner && !isShared) return new Response('Forbidden', { status: 403 });

  const s3 = getS3Client();
  const s3Response = await s3.send(
    new GetObjectCommand({
      Bucket: process.env.S3_BUCKET ?? 'travelbuddy',
      Key: artifact.storagePath,
    }),
  );

  const stream = s3Response.Body!.transformToWebStream();
  const headers: Record<string, string> = {
    'Content-Type': artifact.mimeType ?? 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${artifact.fileName}"`,
  };
  if (s3Response.ContentLength) {
    headers['Content-Length'] = String(s3Response.ContentLength);
  }

  return new Response(stream, { headers });
}
