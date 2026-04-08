import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { processBatchResults } from '@/services/batch';

export async function GET() {
  const session = await auth();
  const userId = (session as { userId?: string })?.userId;
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  // Poll any pending/processing batch jobs and process results if ready
  const pendingJobs = await prisma.batchJob.findMany({
    where: { userId, status: { in: ['pending', 'processing'] } },
    select: { id: true },
  });

  await Promise.allSettled(pendingJobs.map((job) => processBatchResults(job.id)));

  // Return current notifications
  const notifications = await prisma.notification.findMany({
    where: { userId },
    include: { trip: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  const unreadCount = notifications.filter((n) => !n.read).length;

  return Response.json({ data: notifications, unreadCount });
}

export async function PATCH() {
  const session = await auth();
  const userId = (session as { userId?: string })?.userId;
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  await prisma.notification.updateMany({
    where: { userId, read: false },
    data: { read: true },
  });

  return Response.json({ ok: true });
}
