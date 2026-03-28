'use client';

import { useState, useEffect, useMemo } from 'react';
import { Loader2, Mail, Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { GmailMessage } from '@/services/gmail';

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (emails: GmailMessage[]) => void;
}

export function GmailPickerModal({ open, onClose, onSelect }: Props) {
  const [messages, setMessages] = useState<GmailMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError('');
    fetch('/api/gmail/messages')
      .then((r) => r.json())
      .then((data: { messages?: GmailMessage[]; error?: string }) => {
        if (data.error) {
          setError(data.error);
        } else {
          setMessages(data.messages ?? []);
        }
      })
      .catch(() => setError('Failed to load Gmail messages.'))
      .finally(() => setLoading(false));
  }, [open]);

  const filtered = useMemo(() => {
    if (!query.trim()) return messages;
    const q = query.toLowerCase();
    return messages.filter(
      (m) =>
        m.subject.toLowerCase().includes(q) ||
        m.from.toLowerCase().includes(q) ||
        m.snippet.toLowerCase().includes(q),
    );
  }, [messages, query]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleAdd() {
    const chosen = messages.filter((m) => selected.has(m.id));
    onSelect(chosen);
    setSelected(new Set());
    onClose();
  }

  function handleClose() {
    setSelected(new Set());
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Import from Gmail</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search by subject or sender…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 -mx-6 px-6">
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="text-sm">Loading travel emails…</p>
            </div>
          )}

          {!loading && error && (
            <div className="py-8 text-center">
              <p className="text-sm text-destructive">{error}</p>
              {error.includes('sign') && (
                <p className="text-xs text-muted-foreground mt-2">
                  Sign out and sign in again to re-authorize Gmail access.
                </p>
              )}
            </div>
          )}

          {!loading && !error && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
              <Mail className="h-8 w-8" />
              <p className="text-sm">
                {query ? 'No emails match your search.' : 'No travel emails found in the last 90 days.'}
              </p>
            </div>
          )}

          {!loading && !error && filtered.length > 0 && (
            <ul className="space-y-1 py-1">
              {filtered.map((msg) => (
                <li key={msg.id}>
                  <button
                    onClick={() => toggle(msg.id)}
                    className={[
                      'w-full text-left rounded-lg px-3 py-2.5 flex items-start gap-3 transition-colors',
                      selected.has(msg.id)
                        ? 'bg-primary/10 ring-1 ring-primary'
                        : 'hover:bg-muted/60',
                    ].join(' ')}
                  >
                    <div
                      className={[
                        'mt-0.5 h-4 w-4 shrink-0 rounded border transition-colors',
                        selected.has(msg.id)
                          ? 'border-primary bg-primary'
                          : 'border-muted-foreground',
                      ].join(' ')}
                    >
                      {selected.has(msg.id) && (
                        <svg viewBox="0 0 12 12" className="h-full w-full text-primary-foreground">
                          <polyline
                            points="2,6 5,9 10,3"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{msg.subject}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {msg.from} · {new Date(msg.date).toLocaleDateString()}
                      </p>
                      <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                        {msg.snippet}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={selected.size === 0}>
            Add {selected.size > 0 ? `${selected.size} email${selected.size > 1 ? 's' : ''}` : 'emails'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
