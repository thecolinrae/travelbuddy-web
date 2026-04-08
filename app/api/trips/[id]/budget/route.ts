import { withTripAuth } from '@/lib/api';
import { updateBudgetGoals } from '@/services/db';
import type { BudgetItemCategory } from '@/types';

export const PATCH = withTripAuth(async ({ userId, params, request }) => {
  const { id } = params;
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
}, { requireOwner: true });
