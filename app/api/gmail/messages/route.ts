import { auth } from '@/lib/auth';
import { getUserGoogleToken } from '@/lib/auth-hub';
import { searchTravelEmails } from '@/services/gmail';

export async function GET(request: Request) {
  const session = await auth();
  const userId = (session as { userId?: string } | null)?.userId;
  if (!userId) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const labelId = searchParams.get('labelId') ?? undefined;

  try {
    const accessToken = await getUserGoogleToken(userId);
    const messages = await searchTravelEmails(
      accessToken,
      100,
      labelId ? { labelId, fetchAll: true } : undefined,
    );
    return Response.json({ messages });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch Gmail messages';
    return Response.json({ error: message }, { status: 500 });
  }
}
