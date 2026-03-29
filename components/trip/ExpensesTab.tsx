'use client';

import type { TimelineEvent, ExpenseEvent, BudgetItemCategory } from '@/types';

const CATEGORY_LABELS: Record<BudgetItemCategory, string> = {
  flights: '✈️ Flights',
  hotels: '🏨 Hotels',
  car_rental: '🚗 Car rental',
  activities: '🎭 Activities',
  transport: '🚌 Transport',
  food: '🍽 Food',
  insurance: '🛡 Insurance',
  other: '📦 Other',
};

function formatDate(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  });
}

interface Props {
  timeline: TimelineEvent[];
  currency: string;
}

export function ExpensesTab({ timeline, currency }: Props) {
  const expenses = timeline
    .filter((e): e is ExpenseEvent => e.type === 'expense')
    .sort((a, b) => a.date.localeCompare(b.date));

  const total = expenses.reduce((s, e) => s + e.cost.amountPreferredCurrency, 0);

  if (expenses.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground text-sm">
        No expenses found.
      </div>
    );
  }

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <span className="text-sm text-muted-foreground">{expenses.length} expenses</span>
        <span className="font-semibold">{fmt(total)}</span>
      </div>

      <ul className="space-y-2">
        {expenses.map((e) => (
          <li key={e.id} className="flex items-start gap-3 rounded-lg border bg-card px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium truncate">{e.description}</p>
                <p className="text-sm font-semibold shrink-0">{fmt(e.cost.amountPreferredCurrency)}</p>
              </div>
              <div className="flex flex-wrap gap-x-3 mt-0.5">
                <span className="text-xs text-muted-foreground">{formatDate(e.date)}</span>
                <span className="text-xs text-muted-foreground">
                  {CATEGORY_LABELS[e.category as BudgetItemCategory] ?? e.category}
                </span>
                {e.vendor && (
                  <span className="text-xs text-muted-foreground">{e.vendor}</span>
                )}
                {e.cost.localCurrency && e.cost.localCurrency !== currency && (
                  <span className="text-xs text-muted-foreground">
                    {new Intl.NumberFormat('en-US', {
                      style: 'currency',
                      currency: e.cost.localCurrency,
                    }).format(e.cost.amountLocalCurrency ?? 0)}
                  </span>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
