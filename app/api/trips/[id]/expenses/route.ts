import { auth } from '@/lib/auth';
import { getTrip, loadTimeline, saveTimeline } from '@/services/db';
import { makeCost } from '@/services/timeline';
import { fetchRatesFromPreferred } from '@/services/currency';
import type { Cost, ExpenseEvent } from '@/types';

async function getUserId(): Promise<string | null> {
  const session = await auth();
  return (session as { userId?: string })?.userId ?? null;
}

export async function POST(
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

  return Response.json({ expense });
}
