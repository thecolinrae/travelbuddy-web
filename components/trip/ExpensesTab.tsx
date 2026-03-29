'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ExpenseFormModal } from './ExpenseFormModal';
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
  tripId: string;
  timeline: TimelineEvent[];
  currency: string;
  isOwner: boolean;
}

export function ExpensesTab({ tripId, timeline, currency, isOwner }: Props) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseEvent | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const expenses = timeline
    .filter((e): e is ExpenseEvent => e.type === 'expense')
    .sort((a, b) => a.date.localeCompare(b.date));

  const total = expenses.reduce((s, e) => s + e.cost.amountPreferredCurrency, 0);
  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n);

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <span className="text-sm text-muted-foreground">
          {expenses.length} expense{expenses.length !== 1 ? 's' : ''}
        </span>
        <div className="flex items-center gap-3">
          <span className="font-semibold">{fmt(total)}</span>
          {isOwner && (
            <Button size="sm" variant="outline" onClick={() => setAddOpen(true)} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Add
            </Button>
          )}
        </div>
      </div>

      {expenses.length === 0 && (
        <div className="py-12 text-center text-muted-foreground text-sm">
          No expenses found.
        </div>
      )}

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
                      {deleting === e.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Delete'}
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
