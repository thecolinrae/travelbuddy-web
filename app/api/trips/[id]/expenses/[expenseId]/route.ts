import { withTripAuth, apiError } from '@/lib/api';
import { loadTimeline, saveTimeline } from '@/services/db';
import { makeCost, fetchRatesFromPreferred } from '@/services/currency';
import type { Cost, ExpenseEvent, TimelineEvent } from '@/types';

export const PUT = withTripAuth(async ({ params, request }) => {
  const { id, expenseId } = params;
  const body = (await request.json()) as Partial<{
    description: string;
    vendor: string;
    category: string;
    date: string;
    amount: number;
    currency: string;
    localAmount: number;
    localCurrency: string;
    notes: string;
  }>;

  const timeline = await loadTimeline(id);
  const idx = timeline.findIndex((e) => e.id === expenseId && e.type === 'expense');
  if (idx === -1) return apiError('Expense not found', 404);

  const existing = timeline[idx] as ExpenseEvent;

  let cost: Cost;
  if (body.localAmount !== undefined && body.localCurrency) {
    const preferredCurrency = body.currency ?? existing.cost.preferredCurrency;
    const { rates } = await fetchRatesFromPreferred(preferredCurrency);
    cost = makeCost(body.localAmount, body.localCurrency, preferredCurrency, rates);
  } else {
    // No local currency sent — store a plain preferred-currency cost.
    // Any previously stored local fields are intentionally cleared because the user
    // has edited the expense back to the preferred currency.
    cost = {
      amountPreferredCurrency: body.amount ?? existing.cost.amountPreferredCurrency,
      preferredCurrency: body.currency ?? existing.cost.preferredCurrency,
    };
  }

  const updated: ExpenseEvent = {
    ...existing,
    ...(body.description !== undefined && { description: body.description }),
    ...(body.vendor !== undefined && { vendor: body.vendor }),
    ...(body.category !== undefined && { category: body.category }),
    ...(body.date !== undefined && { date: body.date }),
    ...(body.notes !== undefined && { notes: body.notes }),
    cost,
  };

  (timeline as TimelineEvent[])[idx] = updated;
  timeline.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  await saveTimeline(id, timeline);

  return Response.json({ data: updated });
}, { requireOwner: true });

export const DELETE = withTripAuth(async ({ params }) => {
  const { id, expenseId } = params;
  const timeline = await loadTimeline(id);
  const filtered = timeline.filter((e) => !(e.id === expenseId && e.type === 'expense'));
  if (filtered.length === timeline.length) {
    return apiError('Expense not found', 404);
  }
  await saveTimeline(id, filtered);

  return Response.json({ ok: true });
}, { requireOwner: true });
