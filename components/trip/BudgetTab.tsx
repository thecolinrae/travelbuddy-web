'use client';

import type { TimelineEvent, ExpenseEvent, BudgetItemCategory } from '@/types';

const CATEGORIES: BudgetItemCategory[] = [
  'flights', 'hotels', 'car_rental', 'activities', 'transport', 'food', 'insurance', 'other',
];

const CATEGORY_LABELS: Record<BudgetItemCategory, string> = {
  flights: '✈️ Flights',
  hotels: '🏨 Hotels',
  car_rental: '🚗 Car rental',
  activities: '🎭 Activities',
  transport: '🚌 Transport',
  food: '🍽 Food & drink',
  insurance: '🛡 Insurance',
  other: '📦 Other',
};

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
}

interface Props {
  timeline: TimelineEvent[];
  budgetGoal: number | null;
  categoryGoals: Partial<Record<BudgetItemCategory, number>> | null;
  currency: string;
}

export function BudgetTab({ timeline, budgetGoal, categoryGoals, currency }: Props) {
  const expenses = timeline.filter((e): e is ExpenseEvent => e.type === 'expense');

  const totals: Partial<Record<BudgetItemCategory, number>> = {};
  for (const e of expenses) {
    const cat = e.category as BudgetItemCategory;
    totals[cat] = (totals[cat] ?? 0) + e.cost.amountPreferredCurrency;
  }

  const totalSpent = Object.values(totals).reduce((a, b) => a + (b ?? 0), 0);
  const usedCategories = CATEGORIES.filter((c) => (totals[c] ?? 0) > 0);

  return (
    <div className="space-y-6">
      {/* Overall */}
      <div className="rounded-xl border bg-card p-5 space-y-3">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-medium text-muted-foreground">Total spent</p>
          <p className="text-2xl font-semibold">{formatCurrency(totalSpent, currency)}</p>
        </div>
        {budgetGoal && (
          <>
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted-foreground">Budget goal</span>
              <span className={totalSpent > budgetGoal ? 'text-destructive font-medium' : ''}>
                {formatCurrency(budgetGoal, currency)}
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  totalSpent > budgetGoal ? 'bg-destructive' : 'bg-primary'
                }`}
                style={{ width: `${Math.min((totalSpent / budgetGoal) * 100, 100)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground text-right">
              {formatCurrency(Math.max(budgetGoal - totalSpent, 0), currency)} remaining
            </p>
          </>
        )}
      </div>

      {/* Categories */}
      {usedCategories.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            By category
          </h3>
          <ul className="space-y-2">
            {usedCategories.map((cat) => {
              const spent = totals[cat] ?? 0;
              const goal = categoryGoals?.[cat];
              const pct = goal ? Math.min((spent / goal) * 100, 100) : null;
              return (
                <li key={cat} className="rounded-lg border bg-card px-4 py-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">{CATEGORY_LABELS[cat]}</span>
                    <span className="text-sm font-medium">{formatCurrency(spent, currency)}</span>
                  </div>
                  {goal && (
                    <>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full ${pct! >= 100 ? 'bg-destructive' : 'bg-primary'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        of {formatCurrency(goal, currency)} goal
                      </p>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {usedCategories.length === 0 && (
        <div className="py-8 text-center text-muted-foreground text-sm">
          No expenses found in the timeline.
        </div>
      )}
    </div>
  );
}
