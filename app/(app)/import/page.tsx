'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardPaste, Mail, X, FileText, File } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FileUploadZone } from '@/components/import/FileUploadZone';
import { TextPasteModal } from '@/components/import/TextPasteModal';
import { GmailPickerModal } from '@/components/import/GmailPickerModal';
import { ImportProgress } from '@/components/import/ImportProgress';
import { COMMON_CURRENCIES } from '@/services/currency';
import type { GmailMessage } from '@/services/gmail';
import type { TripRow } from '@/services/db';
import { nanoid } from '@/services/nanoid';

type SourceItem =
  | { kind: 'file'; file: File; id: string }
  | { kind: 'text'; text: string; label: string; id: string }
  | { kind: 'email'; email: GmailMessage; id: string };

interface ProgressState {
  step: string;
  completed: number;
  total: number;
}

export default function ImportPage() {
  const router = useRouter();
  const [items, setItems] = useState<SourceItem[]>([]);
  const [tripName, setTripName] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [tripMode, setTripMode] = useState('new');
  const [existingTrips, setExistingTrips] = useState<TripRow[]>([]);
  const [textModalOpen, setTextModalOpen] = useState(false);
  const [gmailModalOpen, setGmailModalOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<ProgressState | null>(null);

  useEffect(() => {
    fetch('/api/trips')
      .then((r) => r.json())
      .then((data: { trips?: TripRow[] }) => setExistingTrips(data.trips ?? []))
      .catch(() => {});
  }, []);

  const addFiles = useCallback((files: File[]) => {
    setItems((prev) => [
      ...prev,
      ...files
        .filter((f) => !prev.some((i) => i.kind === 'file' && i.file.name === f.name))
        .map((f) => ({ kind: 'file' as const, file: f, id: nanoid(8) })),
    ]);
  }, []);

  const addText = useCallback((text: string, label: string) => {
    setItems((prev) => [...prev, { kind: 'text', text, label, id: nanoid(8) }]);
  }, []);

  const addEmails = useCallback((emails: GmailMessage[]) => {
    setItems((prev) => [
      ...prev,
      ...emails
        .filter((e) => !prev.some((i) => i.kind === 'email' && i.email.id === e.id))
        .map((e) => ({ kind: 'email' as const, email: e, id: nanoid(8) })),
    ]);
  }, []);

  const removeItem = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));

  async function handleImport() {
    if (items.length === 0) return;
    setImporting(true);
    setProgress({ step: 'Preparing…', completed: 0, total: items.length });

    const formData = new FormData();
    formData.set('currency', currency);
    if (tripName.trim()) formData.set('tripName', tripName.trim());
    if (tripMode !== 'new') formData.set('tripId', tripMode);

    const emailItems: GmailMessage[] = [];
    for (const item of items) {
      if (item.kind === 'file') formData.append('files', item.file);
      else if (item.kind === 'text') formData.append('texts', item.text);
      else emailItems.push(item.email);
    }
    if (emailItems.length) formData.set('emails', JSON.stringify(emailItems));

    try {
      const response = await fetch('/api/parse', { method: 'POST', body: formData });
      if (!response.ok || !response.body) {
        throw new Error('Import failed. Please try again.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6)) as
              | { type: 'progress'; step: string; completed: number; total: number }
              | { type: 'done'; tripId: string }
              | { type: 'error'; message: string };

            if (event.type === 'progress') {
              setProgress({ step: event.step, completed: event.completed, total: event.total });
            } else if (event.type === 'done') {
              router.push(`/trip/${event.tripId}`);
              return;
            } else if (event.type === 'error') {
              throw new Error(event.message);
            }
          } catch (parseErr) {
            if (parseErr instanceof SyntaxError) continue;
            throw parseErr;
          }
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed.');
      setImporting(false);
      setProgress(null);
    }
  }

  function itemLabel(item: SourceItem): string {
    if (item.kind === 'file') return item.file.name;
    if (item.kind === 'text') return item.label;
    return item.email.subject;
  }

  function ItemIcon({ item }: { item: SourceItem }) {
    if (item.kind === 'file') {
      return item.file.type === 'application/pdf' ? (
        <File className="h-4 w-4 text-red-500 shrink-0" />
      ) : (
        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
      );
    }
    if (item.kind === 'email') return <Mail className="h-4 w-4 text-blue-500 shrink-0" />;
    return <ClipboardPaste className="h-4 w-4 text-muted-foreground shrink-0" />;
  }

  return (
    <>
      <main className="max-w-2xl mx-auto px-4 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Import trip documents</h1>
          <p className="text-muted-foreground mt-1">
            Upload confirmations, paste emails, or pull directly from Gmail.
          </p>
        </div>

        {/* Sources */}
        <section className="space-y-3">
          <FileUploadZone onFiles={addFiles} />
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2" onClick={() => setTextModalOpen(true)}>
              <ClipboardPaste className="h-4 w-4" />
              Paste text
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => setGmailModalOpen(true)}>
              <Mail className="h-4 w-4" />
              From Gmail
            </Button>
          </div>
        </section>

        {/* Selected items */}
        {items.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Selected ({items.length})
            </h2>
            <ul className="space-y-1.5">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-2.5 rounded-lg border bg-muted/30 px-3 py-2"
                >
                  <ItemIcon item={item} />
                  <span className="text-sm truncate flex-1">{itemLabel(item)}</span>
                  <button
                    onClick={() => removeItem(item.id)}
                    className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Remove"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Trip details */}
        <section className="space-y-4 rounded-xl border bg-card p-5">
          <h2 className="text-sm font-semibold">Trip details</h2>

          <div className="space-y-1.5">
            <Label htmlFor="trip-name">Trip name</Label>
            <Input
              id="trip-name"
              placeholder="Auto-detect from documents"
              value={tripName}
              onChange={(e) => setTripName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="currency">Currency</Label>
              <select
                id="currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {COMMON_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="trip-mode">Add to</Label>
              <select
                id="trip-mode"
                value={tripMode}
                onChange={(e) => setTripMode(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="new">✨ New trip</option>
                {existingTrips.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.coverEmoji} {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <Button
          size="lg"
          className="w-full"
          disabled={items.length === 0 || importing}
          onClick={handleImport}
        >
          Import {items.length > 0 ? `${items.length} document${items.length > 1 ? 's' : ''}` : 'documents'}
        </Button>
      </main>

      <TextPasteModal
        open={textModalOpen}
        onClose={() => setTextModalOpen(false)}
        onSubmit={addText}
      />

      <GmailPickerModal
        open={gmailModalOpen}
        onClose={() => setGmailModalOpen(false)}
        onSelect={addEmails}
      />

      {importing && progress && (
        <ImportProgress
          step={progress.step}
          completed={progress.completed}
          total={progress.total}
        />
      )}
    </>
  );
}
