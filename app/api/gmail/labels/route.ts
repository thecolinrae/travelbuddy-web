import { auth } from '@/lib/auth';
import { getUserGoogleToken } from '@/lib/auth-hub';
import { fetchGmailLabels } from '@/services/gmail';

export async function GET() {
  const session = await auth();
  const userId = (session as { userId?: string } | null)?.userId;
  if (!userId) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const accessToken = await getUserGoogleToken(userId);
    const labels = await fetchGmailLabels(accessToken);
    return Response.json({ labels });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch Gmail labels';
    return Response.json({ error: message }, { status: 500 });
  }
}
