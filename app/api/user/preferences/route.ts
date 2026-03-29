import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await auth();
  const userId = (session as { userId?: string })?.userId;
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await prisma.profile.findUnique({
    where: { id: userId },
    select: { preferredCurrency: true, name: true, email: true, avatarUrl: true },
  });

  return Response.json({ profile });
}

export async function PATCH(request: Request) {
  const session = await auth();
  const userId = (session as { userId?: string })?.userId;
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json()) as { preferredCurrency?: string };
  if (!body.preferredCurrency) return Response.json({ error: 'Missing preferredCurrency' }, { status: 400 });

  await prisma.profile.update({
    where: { id: userId },
    data: { preferredCurrency: body.preferredCurrency },
  });

  return Response.json({ ok: true });
}
