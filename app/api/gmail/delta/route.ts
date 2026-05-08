import { auth } from '@/lib/auth';
import { getUserGoogleToken } from '@/lib/auth-hub';
import { getTrip, getImportedGmailIds } from '@/services/db';
import { searchTravelEmails } from '@/services/gmail';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  const session = await auth();
  const userId = (session as { userId?: string } | null)?.userId;

  if (!userId) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const tripId = searchParams.get('tripId');
  const labelId = searchParams.get('labelId');

  if (!tripId || !labelId) {
    return Response.json({ error: 'tripId and labelId are required' }, { status: 400 });
  }

  const trip = await getTrip(tripId, userId);
  if (!trip) {
    return Response.json({ error: 'Trip not found' }, { status: 403 });
  }

  try {
    const accessToken = await getUserGoogleToken(userId);
    const [importedIds, allMessages] = await Promise.all([
      getImportedGmailIds(tripId, labelId),
      searchTravelEmails(accessToken, 100, { labelId, fetchAll: true }),
    ]);

    const newMessages = allMessages.filter((m) => !importedIds.has(m.id));

    const labelRow = await prisma.artifact.findFirst({
      where: { tripId, gmailLabelId: labelId },
      select: { gmailLabelName: true },
    });
    const labelName = labelRow?.gmailLabelName ?? labelId;

    return Response.json({ messages: newMessages, labelName });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to compute delta';
    return Response.json({ error: message }, { status: 500 });
  }
}
