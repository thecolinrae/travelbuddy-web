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

function senderInitial(from: string): string {
  // "Name <email>" → first letter of Name; fallback to email first char
  const name = from.replace(/<[^>]+>/, '').trim();
  return (name[0] ?? from[0] ?? '?').toUpperCase();
}

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-purple-500', 'bg-green-500', 'bg-orange-500',
  'bg-rose-500', 'bg-teal-500', 'bg-indigo-500', 'bg-amber-500',
];

function avatarColor(from: string): string {
  let hash = 0;
  for (let i = 0; i < from.length; i++) hash = (hash * 31 + from.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'short' });
  if (d.getFullYear() === now.getFullYear())
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function senderName(from: string): string {
  const match = from.match(/^(.+?)\s*</);
  return match ? match[1].trim().replace(/^["']|["']$/g, '') : from;
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
        if (data.error) setError(data.error);
        else setMessages(data.messages ?? []);
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

  function selectAll() {
    setSelected(new Set(filtered.map((m) => m.id)));
  }

  function clearAll() {
    setSelected(new Set());
  }

  function handleAdd() {
    onSelect(messages.filter((m) => selected.has(m.id)));
    setSelected(new Set());
    onClose();
  }

  function handleClose() {
    setSelected(new Set());
    onClose();
  }

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((m) => selected.has(m.id));

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-xl overflow-hidden p-0">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 space-y-3">
          <DialogHeader>
            <div className="flex items-center justify-between pr-6">
              <DialogTitle>Import from Gmail</DialogTitle>
              {!loading && messages.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {messages.length} email{messages.length !== 1 ? 's' : ''}
                  {selected.size > 0 && (
                    <span className="text-primary font-medium"> · {selected.size} selected</span>
                  )}
                </span>
              )}
            </div>
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

          {!loading && filtered.length > 0 && (
            <div className="flex justify-end">
              <button
                onClick={allFilteredSelected ? clearAll : selectAll}
                className="text-xs text-primary hover:underline"
              >
                {allFilteredSelected ? 'Clear selection' : `Select all ${filtered.length}`}
              </button>
            </div>
          )}
        </div>

        {/* Scrollable list — explicit max-h avoids fighting DialogContent's grid layout */}
        <div className="overflow-y-auto max-h-[calc(80vh-14rem)] border-t border-b">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="text-sm">Loading travel emails…</p>
            </div>
          )}

          {!loading && error && (
            <div className="py-10 px-6 text-center space-y-1">
              <p className="text-sm text-destructive">{error}</p>
              {error.includes('sign') && (
                <p className="text-xs text-muted-foreground">
                  Sign out and sign in again to re-authorize Gmail access.
                </p>
              )}
            </div>
          )}

          {!loading && !error && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
              <Mail className="h-8 w-8" />
              <p className="text-sm">
                {query ? 'No emails match your search.' : 'No travel emails found in the last 90 days.'}
              </p>
            </div>
          )}

          {!loading && !error && filtered.length > 0 && (
            <ul className="divide-y">
              {filtered.map((msg) => {
                const isSelected = selected.has(msg.id);
                return (
                  <li key={msg.id}>
                    <button
                      onClick={() => toggle(msg.id)}
                      className={[
                        'w-full text-left px-4 py-3 flex items-start gap-3 transition-colors',
                        isSelected
                          ? 'bg-primary/8 border-l-2 border-primary'
                          : 'hover:bg-muted/50 border-l-2 border-transparent',
                      ].join(' ')}
                    >
                      {/* Sender avatar */}
                      <div className={[
                        'mt-0.5 h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-xs font-semibold text-white',
                        avatarColor(msg.from),
                      ].join(' ')}>
                        {senderInitial(msg.from)}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-sm font-medium truncate">{msg.subject || '(no subject)'}</p>
                          <span className="text-xs text-muted-foreground shrink-0">{formatDate(msg.date)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{senderName(msg.from)}</p>
                        <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5 opacity-75">
                          {msg.snippet}
                        </p>
                      </div>

                      {/* Checkbox */}
                      <div className={[
                        'mt-1 h-4 w-4 shrink-0 rounded border-2 transition-colors flex items-center justify-center',
                        isSelected ? 'border-primary bg-primary' : 'border-muted-foreground/40',
                      ].join(' ')}>
                        {isSelected && (
                          <svg viewBox="0 0 10 10" className="h-2.5 w-2.5 text-primary-foreground">
                            <polyline
                              points="1.5,5 4,7.5 8.5,2"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4">
          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={selected.size === 0}>
              Add {selected.size > 0 ? `${selected.size} email${selected.size > 1 ? 's' : ''}` : 'emails'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
