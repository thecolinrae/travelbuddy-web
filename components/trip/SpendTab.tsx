'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Pencil, Check, X, Receipt, Plus, Trash2, Loader2, ChevronDown,
  Plane, Building2, Car, Binoculars, Bus, UtensilsCrossed, Shield, MoreHorizontal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ExpenseFormModal } from './ExpenseFormModal';
import type { TimelineEvent, ExpenseEvent, BudgetItemCategory } from '@/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES: BudgetItemCategory[] = [
  'flights', 'hotels', 'car_rental', 'activities', 'transport', 'food', 'insurance', 'other',
];

const CATEGORY_LABELS: Record<BudgetItemCategory, string> = {
  flights:    'Flights',
  hotels:     'Hotels',
  car_rental: 'Car rental',
  activities: 'Activities',
  transport:  'Transport',
  food:       'Food & drink',
  insurance:  'Insurance',
  other:      'Other',
};

const CATEGORY_ICONS: Record<BudgetItemCategory, React.ReactNode> = {
  flights:    <Plane className="h-4 w-4 shrink-0" />,
  hotels:     <Building2 className="h-4 w-4 shrink-0" />,
  car_rental: <Car className="h-4 w-4 shrink-0" />,
  activities: <Binoculars className="h-4 w-4 shrink-0" />,
  transport:  <Bus className="h-4 w-4 shrink-0" />,
  food:       <UtensilsCrossed className="h-4 w-4 shrink-0" />,
  insurance:  <Shield className="h-4 w-4 shrink-0" />,
  other:      <MoreHorizontal className="h-4 w-4 shrink-0" />,
};

const CATEGORY_ICONS_SM: Record<BudgetItemCategory, React.ReactNode> = {
  flights:    <Plane className="h-3 w-3 shrink-0" />,
  hotels:     <Building2 className="h-3 w-3 shrink-0" />,
  car_rental: <Car className="h-3 w-3 shrink-0" />,
  activities: <Binoculars className="h-3 w-3 shrink-0" />,
  transport:  <Bus className="h-3 w-3 shrink-0" />,
  food:       <UtensilsCrossed className="h-3 w-3 shrink-0" />,
  insurance:  <Shield className="h-3 w-3 shrink-0" />,
  other:      <MoreHorizontal className="h-3 w-3 shrink-0" />,
};

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  });
}

// ─── InlineGoalEdit ───────────────────────────────────────────────────────────

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
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') cancel();
          }}
        />
        <button onClick={commit} className="text-primary hover:text-primary/80">
          <Check className="h-4 w-4" />
        </button>
        <button onClick={cancel} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
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

// ─── SpendTab ─────────────────────────────────────────────────────────────────

interface Props {
  tripId: string;
  timeline: TimelineEvent[];
  budgetGoal: number | null;
  categoryGoals: Partial<Record<BudgetItemCategory, number>> | null;
  currency: string;
  isOwner: boolean;
}

export function SpendTab({ tripId, timeline, budgetGoal, categoryGoals, currency, isOwner }: Props) {
  const router = useRouter();

  // ── Expense CRUD state
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseEvent | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  // ── UI state
  const [activeCategory, setActiveCategory] = useState<BudgetItemCategory | 'all'>('all');
  const [showAllCategories, setShowAllCategories] = useState(false);

  // ── Derived data
  const expenses = useMemo(
    () =>
      timeline
        .filter((e): e is ExpenseEvent => e.type === 'expense')
        .sort((a, b) => a.date.localeCompare(b.date)),
    [timeline],
  );

  const totals = useMemo(() => {
    const t: Partial<Record<BudgetItemCategory, number>> = {};
    for (const e of expenses) {
      const cat = e.category as BudgetItemCategory;
      t[cat] = (t[cat] ?? 0) + e.cost.amountPreferredCurrency;
    }
    return t;
  }, [expenses]);

  const totalSpent = useMemo(
    () => Object.values(totals).reduce((a, b) => a + (b ?? 0), 0),
    [totals],
  );

  const filteredExpenses = useMemo(
    () => (activeCategory === 'all' ? expenses : expenses.filter((e) => e.category === activeCategory)),
    [expenses, activeCategory],
  );

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n);

  // ── API helpers
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

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      await fetch(`/api/trips/${tripId}/expenses/${id}`, { method: 'DELETE' });
      router.refresh();
    } finally {
      setDeleting(null);
      setConfirmDelete(null);
    }
  }

  // ── Category breakdown helpers
  const visibleCategories = showAllCategories
    ? CATEGORIES
    : CATEGORIES.filter((cat) => (totals[cat] ?? 0) > 0 || !!categoryGoals?.[cat]);
  const hiddenCount = CATEGORIES.length - visibleCategories.length;

  // ── Active chips (categories with spending)
  const activeChipCategories = CATEGORIES.filter((cat) => (totals[cat] ?? 0) > 0);

  return (
    <div className="space-y-6">

      {/* ── Budget summary card ─────────────────────────────────────────────── */}
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

      {/* ── Category breakdown ─────────────────────────────────────────────── */}
      <div className="space-y-3">
        <h3 className="text-xs font-medium text-text-muted uppercase tracking-wide">
          By category
        </h3>

        <ul className="space-y-2">
          {visibleCategories.map((cat) => {
            const spent = totals[cat] ?? 0;
            const goal = categoryGoals?.[cat];
            const pct = goal ? Math.min((spent / goal) * 100, 100) : null;
            return (
              <li key={cat} className="rounded-lg border bg-card px-4 py-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm text-text-base">
                    <span className="text-text-muted">{CATEGORY_ICONS[cat]}</span>
                    {CATEGORY_LABELS[cat]}
                  </span>
                  <span className="text-sm font-medium tabular-nums">
                    {formatCurrency(spent, currency)}
                  </span>
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

        {hiddenCount > 0 && (
          <button
            onClick={() => setShowAllCategories((v) => !v)}
            className="flex items-center gap-1 text-xs text-text-muted hover:text-text-base transition-colors"
          >
            <ChevronDown
              className={`h-3 w-3 transition-transform ${showAllCategories ? 'rotate-180' : ''}`}
            />
            {showAllCategories
              ? 'Show fewer categories'
              : `Show ${hiddenCount} inactive categor${hiddenCount === 1 ? 'y' : 'ies'}`}
          </button>
        )}
      </div>

      {/* ── Expense section ────────────────────────────────────────────────── */}
      <div className="space-y-3">

        {/* Section header */}
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium text-text-muted uppercase tracking-wide">
            Expenses
          </h3>
          {isOwner && (
            <Button size="sm" variant="outline" onClick={() => setAddOpen(true)} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Add
            </Button>
          )}
        </div>

        {/* No expenses at all */}
        {expenses.length === 0 ? (
          <div className="py-10 flex flex-col items-center gap-4 text-center">
            <div className="rounded-full bg-surface p-4">
              <Receipt className="h-8 w-8 text-text-muted" />
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-text-base">No expenses yet</p>
              <p className="type-caption max-w-xs">
                Import booking documents or add an expense to start tracking your spend.
              </p>
            </div>
            {isOwner && (
              <Button size="sm" variant="outline" onClick={() => setAddOpen(true)} className="gap-1.5">
                <Plus className="h-4 w-4" />
                Add expense
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* Category filter chips */}
            {activeChipCategories.length > 1 && (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setActiveCategory('all')}
                  className={[
                    'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                    activeCategory === 'all'
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card border-border text-text-muted hover:text-text-base',
                  ].join(' ')}
                >
                  All ({expenses.length})
                </button>
                {activeChipCategories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(activeCategory === cat ? 'all' : cat)}
                    className={[
                      'flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                      activeCategory === cat
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-card border-border text-text-muted hover:text-text-base',
                    ].join(' ')}
                  >
                    {CATEGORY_ICONS_SM[cat]}
                    {CATEGORY_LABELS[cat]}
                  </button>
                ))}
              </div>
            )}

            {/* List header: count + filtered total */}
            <div className="flex items-center justify-between px-1">
              <span className="text-sm text-muted-foreground">
                {filteredExpenses.length} expense{filteredExpenses.length !== 1 ? 's' : ''}
                {activeCategory !== 'all' && (
                  <span className="text-text-light"> in {CATEGORY_LABELS[activeCategory]}</span>
                )}
              </span>
              <span className="font-semibold text-sm tabular-nums">
                {fmt(filteredExpenses.reduce((s, e) => s + e.cost.amountPreferredCurrency, 0))}
              </span>
            </div>

            {/* Filtered empty state */}
            {filteredExpenses.length === 0 ? (
              <div className="py-8 text-center space-y-2">
                <p className="text-sm text-text-muted">
                  No {CATEGORY_LABELS[activeCategory as BudgetItemCategory]} expenses yet.
                </p>
                <button
                  onClick={() => setActiveCategory('all')}
                  className="text-xs text-secondary hover:underline"
                >
                  Show all expenses
                </button>
              </div>
            ) : (
              <ul className="space-y-2">
                {filteredExpenses.map((e) => (
                  <li key={e.id} className="flex items-start gap-3 rounded-lg border bg-card px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium truncate">{e.description}</p>
                        <p className="text-sm font-semibold shrink-0 tabular-nums">
                          {fmt(e.cost.amountPreferredCurrency)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                        <span className="text-xs text-muted-foreground">{formatDate(e.date)}</span>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          {CATEGORY_ICONS_SM[e.category as BudgetItemCategory]}
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

                    {isOwner && (
                      <div className="flex items-center gap-1 shrink-0">
                        {confirmDelete === e.id ? (
                          <>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDelete(e.id)}
                              disabled={deleting === e.id}
                            >
                              {deleting === e.id
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : 'Delete'}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditing(e)}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setConfirmDelete(e.id)}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {addOpen && (
        <ExpenseFormModal
          tripId={tripId}
          currency={currency}
          open={addOpen}
          onClose={() => setAddOpen(false)}
          onSaved={() => router.refresh()}
        />
      )}
      {editing && (
        <ExpenseFormModal
          tripId={tripId}
          currency={currency}
          open={!!editing}
          onClose={() => setEditing(null)}
          onSaved={() => router.refresh()}
          editing={editing}
        />
      )}
    </div>
  );
}
