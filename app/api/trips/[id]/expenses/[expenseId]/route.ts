import { auth } from '@/lib/auth';
import { getTrip, loadTimeline, saveTimeline } from '@/services/db';
import { makeCost } from '@/services/timeline';
import { fetchRatesFromPreferred } from '@/services/currency';
import type { Cost, ExpenseEvent, TimelineEvent } from '@/types';

async function getUserId(): Promise<string | null> {
  const session = await auth();
  return (session as { userId?: string })?.userId ?? null;
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; expenseId: string }> },
) {
  const { id, expenseId } = await params;
  const userId = await getUserId();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const trip = await getTrip(id, userId);
  if (!trip) return Response.json({ error: 'Not found' }, { status: 404 });
  if (trip.userId !== userId) return Response.json({ error: 'Forbidden' }, { status: 403 });

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
  if (idx === -1) return Response.json({ error: 'Expense not found' }, { status: 404 });

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

  return Response.json({ expense: updated });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; expenseId: string }> },
) {
  const { id, expenseId } = await params;
  const userId = await getUserId();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const trip = await getTrip(id, userId);
  if (!trip) return Response.json({ error: 'Not found' }, { status: 404 });
  if (trip.userId !== userId) return Response.json({ error: 'Forbidden' }, { status: 403 });

  const timeline = await loadTimeline(id);
  const filtered = timeline.filter((e) => !(e.id === expenseId && e.type === 'expense'));
  if (filtered.length === timeline.length) {
    return Response.json({ error: 'Expense not found' }, { status: 404 });
  }
  await saveTimeline(id, filtered);

  return Response.json({ ok: true });
}
