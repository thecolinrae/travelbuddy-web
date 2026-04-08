import { withTripAuth } from '@/lib/api';
import { loadTimeline, saveTimeline } from '@/services/db';
import { makeCost, fetchRatesFromPreferred } from '@/services/currency';
import type { Cost, ExpenseEvent } from '@/types';

export const POST = withTripAuth(async ({ params, request }) => {
  const { id } = params;
  const body = (await request.json()) as {
    description: string;
    vendor?: string;
    category: string;
    date: string;
    amount: number;
    currency: string;
    localAmount?: number;
    localCurrency?: string;
    notes?: string;
  };

  const preferredCurrency = body.currency;
  let cost: Cost;

  if (
    body.localAmount !== undefined &&
    body.localCurrency &&
    body.localCurrency !== preferredCurrency
  ) {
    const { rates } = await fetchRatesFromPreferred(preferredCurrency);
    cost = makeCost(body.localAmount, body.localCurrency, preferredCurrency, rates);
  } else {
    cost = { amountPreferredCurrency: body.amount, preferredCurrency };
  }

  const expense: ExpenseEvent = {
    id: crypto.randomUUID(),
    type: 'expense',
    date: body.date,
    locationCity: '',
    description: body.description,
    vendor: body.vendor,
    category: body.category,
    cost,
    isManual: true,
    notes: body.notes,
  };

  const timeline = await loadTimeline(id);
  timeline.push(expense);
  timeline.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  await saveTimeline(id, timeline);

  return Response.json({ data: expense });
}, { requireOwner: true });
