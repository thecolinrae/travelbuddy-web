import { auth } from '@/lib/auth';
import { searchTravelEmails } from '@/services/gmail';

export async function GET(request: Request) {
  const session = await auth();
  if (!(session as { accessToken?: string })?.accessToken) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const labelId = searchParams.get('labelId') ?? undefined;

  try {
    const messages = await searchTravelEmails(
      (session as { accessToken: string }).accessToken,
      100,
      labelId ? { labelId, fetchAll: true } : undefined,
    );
    return Response.json({ messages });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch Gmail messages';
    return Response.json({ error: message }, { status: 500 });
  }
}
