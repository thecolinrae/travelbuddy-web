import { auth } from '@/lib/auth';
import { fetchGmailLabels } from '@/services/gmail';

export async function GET() {
  const session = await auth();
  if (!(session as { accessToken?: string })?.accessToken) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const labels = await fetchGmailLabels(
      (session as { accessToken: string }).accessToken,
    );
    return Response.json({ labels });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch Gmail labels';
    return Response.json({ error: message }, { status: 500 });
  }
}
