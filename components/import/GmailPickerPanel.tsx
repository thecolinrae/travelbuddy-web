'use client';

import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Loader2, Mail, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { GmailMessage } from '@/services/gmail';

interface Props {
  onBack: () => void;
  onSelect: (emails: GmailMessage[]) => void;
}

function senderInitial(from: string): string {
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

export function GmailPickerPanel({ onBack, onSelect }: Props) {
  const [messages, setMessages] = useState<GmailMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch('/api/gmail/messages')
      .then((r) => r.json())
      .then((data: { messages?: GmailMessage[]; error?: string }) => {
        if (data.error) setError(data.error);
        else setMessages(data.messages ?? []);
      })
      .catch(() => setError('Failed to load Gmail messages.'))
      .finally(() => setLoading(false));
  }, []);

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

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((m) => selected.has(m.id));

  function handleAdd() {
    onSelect(messages.filter((m) => selected.has(m.id)));
    onBack();
  }

  return (
    <div className="flex flex-col h-full">
      {/* Sticky header */}
      <div className="space-y-3 pb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-semibold tracking-tight">Import from Gmail</h1>
            {!loading && messages.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {messages.length} travel email{messages.length !== 1 ? 's' : ''} found
                {selected.size > 0 && (
                  <span className="text-primary font-medium"> · {selected.size} selected</span>
                )}
              </p>
            )}
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search by subject or sender…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
            autoFocus
          />
        </div>

        {!loading && filtered.length > 0 && (
          <div className="flex justify-end">
            <button
              onClick={() =>
                allFilteredSelected
                  ? setSelected(new Set())
                  : setSelected(new Set(filtered.map((m) => m.id)))
              }
              className="text-xs text-primary hover:underline"
            >
              {allFilteredSelected ? 'Clear selection' : `Select all ${filtered.length}`}
            </button>
          </div>
        )}
      </div>

      {/* Scrollable list — takes remaining height with no artificial cap */}
      <div className="flex-1 overflow-y-auto rounded-xl border divide-y">
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-sm">Loading travel emails…</p>
          </div>
        )}

        {!loading && error && (
          <div className="py-16 text-center space-y-1.5 px-6">
            <p className="text-sm text-destructive">{error}</p>
            {error.includes('sign') && (
              <p className="text-xs text-muted-foreground">
                Sign out and sign in again to re-authorize Gmail access.
              </p>
            )}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-2 text-muted-foreground">
            <Mail className="h-8 w-8" />
            <p className="text-sm">
              {query
                ? 'No emails match your search.'
                : 'No travel emails found in the last 90 days.'}
            </p>
          </div>
        )}

        {!loading && !error && filtered.length > 0 &&
          filtered.map((msg) => {
            const isSelected = selected.has(msg.id);
            return (
              <button
                key={msg.id}
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
                  'mt-0.5 h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-sm font-semibold text-white',
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
            );
          })
        }
      </div>

      {/* Sticky footer */}
      <div className="pt-4 flex gap-2 justify-end">
        <Button variant="outline" onClick={onBack}>
          Cancel
        </Button>
        <Button onClick={handleAdd} disabled={selected.size === 0}>
          Add {selected.size > 0
            ? `${selected.size} email${selected.size > 1 ? 's' : ''}`
            : 'emails'}
        </Button>
      </div>
    </div>
  );
}
