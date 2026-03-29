'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Check, X, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { TimelineEvent, ExpenseEvent, BudgetItemCategory } from '@/types';

const CATEGORIES: BudgetItemCategory[] = [
  'flights', 'hotels', 'car_rental', 'activities', 'transport', 'food', 'insurance', 'other',
];

const CATEGORY_LABELS: Record<BudgetItemCategory, string> = {
  flights: 'Flights',
  hotels: 'Hotels',
  car_rental: 'Car rental',
  activities: 'Activities',
  transport: 'Transport',
  food: 'Food & drink',
  insurance: 'Insurance',
  other: 'Other',
};

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
}

interface Props {
  tripId: string;
  timeline: TimelineEvent[];
  budgetGoal: number | null;
  categoryGoals: Partial<Record<BudgetItemCategory, number>> | null;
  currency: string;
  isOwner: boolean;
}

function InlineGoalEdit({
  label,
  value,
  currency,
  onSave,
}: {
  label: string;
  value: number | null;
  currency: string;
  onSave: (v: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ? String(value) : '');

  function commit() {
    const n = draft.trim() ? parseFloat(draft) : null;
    onSave(isNaN(n!) ? null : n);
    setEditing(false);
  }

  function cancel() {
    setDraft(value ? String(value) : '');
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-sm text-muted-foreground">{label}</span>
        <Input
          type="number"
          min="0"
          step="1"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="h-7 w-28 text-sm px-2"
          autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel(); }}
        />
        <button onClick={commit} className="text-primary hover:text-primary/80"><Check className="h-4 w-4" /></button>
        <button onClick={cancel} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>
    );
  }

  return (
    <button
      onClick={() => { setDraft(value ? String(value) : ''); setEditing(true); }}
      className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground group"
    >
      {value ? (
        <span className="font-medium text-foreground">{formatCurrency(value, currency)}</span>
      ) : (
        <span className="text-primary text-xs font-medium">+ Set {label.toLowerCase()}</span>
      )}
      <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" />
    </button>
  );
}

export function BudgetTab({ tripId, timeline, budgetGoal, categoryGoals, currency, isOwner }: Props) {
  const router = useRouter();
  const expenses = timeline.filter((e): e is ExpenseEvent => e.type === 'expense');

  const totals: Partial<Record<BudgetItemCategory, number>> = {};
  for (const e of expenses) {
    const cat = e.category as BudgetItemCategory;
    totals[cat] = (totals[cat] ?? 0) + e.cost.amountPreferredCurrency;
  }

  const totalSpent = Object.values(totals).reduce((a, b) => a + (b ?? 0), 0);

  async function saveGoals(
    newBudgetGoal: number | null,
    newCategoryGoals: Partial<Record<BudgetItemCategory, number>> | null,
  ) {
    await fetch(`/api/trips/${tripId}/budget`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ budgetGoal: newBudgetGoal, categoryGoals: newCategoryGoals }),
    });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* Overall */}
      <div className="rounded-xl border bg-card p-5 space-y-3">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-medium text-muted-foreground">Total spent</p>
          <p className="text-2xl font-semibold">{formatCurrency(totalSpent, currency)}</p>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Budget goal</p>
          {isOwner ? (
            <InlineGoalEdit
              label="Budget goal"
              value={budgetGoal}
              currency={currency}
              onSave={(v) => saveGoals(v, categoryGoals)}
            />
          ) : budgetGoal ? (
            <span className={`text-sm ${totalSpent > budgetGoal ? 'text-destructive font-medium' : ''}`}>
              {formatCurrency(budgetGoal, currency)}
            </span>
          ) : null}
        </div>

        {budgetGoal && (
          <>
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

      {/* Empty state */}
      {expenses.length === 0 && (
        <div className="py-10 flex flex-col items-center gap-4 text-center">
          <div className="rounded-full bg-surface p-4">
            <Receipt className="h-8 w-8 text-text-muted" />
          </div>
          <div className="space-y-1">
            <p className="font-semibold text-text-base">No expenses tracked</p>
            <p className="type-caption max-w-xs">Import booking documents or add expenses in the Expenses tab to start tracking spend.</p>
          </div>
        </div>
      )}

      {/* Categories — always shown so goals can be set before any spending */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          By category
        </h3>
        <ul className="space-y-2">
          {CATEGORIES.map((cat) => {
              const spent = totals[cat] ?? 0;
              const goal = categoryGoals?.[cat];
              const pct = goal ? Math.min((spent / goal) * 100, 100) : null;
              return (
                <li key={cat} className="rounded-lg border bg-card px-4 py-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">{CATEGORY_LABELS[cat]}</span>
                    <span className="text-sm font-medium">{formatCurrency(spent, currency)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    {isOwner ? (
                      <InlineGoalEdit
                        label={`${CATEGORY_LABELS[cat]} goal`}
                        value={goal ?? null}
                        currency={currency}
                        onSave={(v) => {
                          const updated = { ...(categoryGoals ?? {}) };
                          if (v === null) delete updated[cat];
                          else updated[cat] = v;
                          saveGoals(budgetGoal, updated);
                        }}
                      />
                    ) : goal ? (
                      <p className="text-xs text-muted-foreground">
                        of {formatCurrency(goal, currency)} goal
                      </p>
                    ) : null}
                  </div>
                  {goal && (
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full ${pct! >= 100 ? 'bg-destructive' : 'bg-primary'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
    </div>
  );
}
