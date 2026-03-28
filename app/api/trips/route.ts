import { auth } from '@/lib/auth';
import { listTrips } from '@/services/db';

export async function GET() {
  const session = await auth();
  const userId = (session as { userId?: string })?.userId;
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const trips = await listTrips(userId);
  return Response.json({ trips });
}
