import { auth } from '@/lib/auth';
import { getTrip, getImportedGmailIds } from '@/services/db';
import { searchTravelEmails } from '@/services/gmail';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  const session = await auth();
  const userId = (session as { userId?: string; accessToken?: string } | null)?.userId;
  const accessToken = (session as { accessToken?: string } | null)?.accessToken;

  if (!userId || !accessToken) {
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
    const [importedIds, allMessages] = await Promise.all([
      getImportedGmailIds(tripId, labelId),
      searchTravelEmails(accessToken, 100, { labelId, fetchAll: true }),
    ]);

    const newMessages = allMessages.filter((m) => !importedIds.has(m.id));

    // Resolve label name from the DB (already stored from original import)
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
