'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { COMMON_CURRENCIES } from '@/services/currency';
import type { ExpenseEvent, BudgetItemCategory } from '@/types';

const CATEGORIES: { value: BudgetItemCategory; label: string }[] = [
  { value: 'flights',    label: 'Flights'    },
  { value: 'hotels',     label: 'Hotels'     },
  { value: 'car_rental', label: 'Car rental' },
  { value: 'activities', label: 'Activities' },
  { value: 'transport',  label: 'Transport'  },
  { value: 'food',       label: 'Food'       },
  { value: 'insurance',  label: 'Insurance'  },
  { value: 'other',      label: 'Other'      },
];

interface Props {
  tripId: string;
  currency: string;   // trip's preferred currency
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editing?: ExpenseEvent;
}

export function ExpenseFormModal({ tripId, currency, open, onClose, onSaved, editing }: Props) {
  const [description, setDescription] = useState(editing?.description ?? '');
  const [vendor, setVendor] = useState(editing?.vendor ?? '');
  const [category, setCategory] = useState<BudgetItemCategory>(
    (editing?.category as BudgetItemCategory) ?? 'other',
  );
  const [date, setDate] = useState(editing?.date ?? new Date().toISOString().slice(0, 10));

  // When editing: show the original entered amount and currency.
  // If the expense has local currency data, that's what the user originally typed.
  // Otherwise, show the preferred currency amount.
  const [enteredAmount, setEnteredAmount] = useState(
    editing
      ? String(editing.cost.amountLocalCurrency ?? editing.cost.amountPreferredCurrency)
      : '',
  );
  const [enteredCurrency, setEnteredCurrency] = useState(
    editing?.cost.localCurrency ?? editing?.cost.preferredCurrency ?? currency,
  );

  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [saving, setSaving] = useState(false);

  const needsConversion = enteredCurrency !== currency;
  const canSave = !!(description.trim() && date && enteredAmount);

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      const parsed = parseFloat(enteredAmount);

      // If the entered currency differs from the trip's preferred currency, the server
      // treats it as a local currency amount and converts. Otherwise it's a direct save.
      const body = needsConversion
        ? {
            description: description.trim(),
            vendor: vendor.trim() || undefined,
            category,
            date,
            amount: 0,              // placeholder; server ignores when localAmount is present
            currency,               // trip's preferred currency
            localAmount: parsed,
            localCurrency: enteredCurrency,
            notes: notes.trim() || undefined,
          }
        : {
            description: description.trim(),
            vendor: vendor.trim() || undefined,
            category,
            date,
            amount: parsed,
            currency,
            notes: notes.trim() || undefined,
          };

      if (editing) {
        await fetch(`/api/trips/${tripId}/expenses/${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } else {
        await fetch(`/api/trips/${tripId}/expenses`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      }
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit expense' : 'Add expense'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="exp-desc">Description</Label>
            <Input
              id="exp-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Hotel Wifi, Museum ticket"
            />
          </div>

          <div className="flex gap-3">
            <div className="space-y-1.5 flex-1">
              <Label htmlFor="exp-amount">Amount</Label>
              <Input
                id="exp-amount"
                type="number"
                min="0"
                step="0.01"
                value={enteredAmount}
                onChange={(e) => setEnteredAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5 w-44">
              <Label htmlFor="exp-currency">Currency</Label>
              <Select
                id="exp-currency"
                value={enteredCurrency}
                onChange={(e) => setEnteredCurrency(e.target.value)}
              >
                {COMMON_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                ))}
              </Select>
            </div>
          </div>

          {needsConversion && (
            <p className="text-xs text-muted-foreground">
              Will be converted to {currency} when saved.
            </p>
          )}

          <div className="flex gap-3">
            <div className="space-y-1.5 flex-1">
              <Label htmlFor="exp-category">Category</Label>
              <Select
                id="exp-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as BudgetItemCategory)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5 flex-1">
              <Label htmlFor="exp-date">Date</Label>
              <Input
                id="exp-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="exp-vendor">Vendor (optional)</Label>
            <Input
              id="exp-vendor"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              placeholder="e.g. Starbucks"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="exp-notes">Notes (optional)</Label>
            <Input
              id="exp-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional notes"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !canSave}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Add expense'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
