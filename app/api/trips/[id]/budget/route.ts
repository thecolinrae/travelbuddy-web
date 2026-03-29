import { auth } from '@/lib/auth';
import { getTrip, updateBudgetGoals } from '@/services/db';
import type { BudgetItemCategory } from '@/types';

async function getUserId(): Promise<string | null> {
  const session = await auth();
  return (session as { userId?: string })?.userId ?? null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const userId = await getUserId();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const trip = await getTrip(id, userId);
  if (!trip) return Response.json({ error: 'Not found' }, { status: 404 });
  if (trip.userId !== userId) return Response.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await request.json()) as {
    budgetGoal?: number | null;
    categoryGoals?: Partial<Record<BudgetItemCategory, number>> | null;
  };

  await updateBudgetGoals(
    id,
    userId,
    body.budgetGoal ?? null,
    body.categoryGoals ?? null,
  );

  return Response.json({ ok: true });
}
