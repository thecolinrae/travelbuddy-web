'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw, Tag } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ImportProgress } from '@/components/import/ImportProgress';
import type { LabelSync } from '@/services/db';
import type { GmailMessage } from '@/services/gmail';
import type { ImportWarning } from '@/types';

interface Props {
  tripId: string;
  labelSyncs: LabelSync[];
}

interface ProgressState {
  step: string;
  completed: number;
  total: number;
}

function formatSyncDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'short' });
  if (d.getFullYear() === now.getFullYear())
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function GmailSyncSection({ tripId, labelSyncs }: Props) {
  const router = useRouter();
  const [syncing, setSyncing] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressState | null>(null);

  async function handleSync(labelId: string) {
    setSyncing(labelId);
    try {
      const res = await fetch(
        `/api/gmail/delta?tripId=${encodeURIComponent(tripId)}&labelId=${encodeURIComponent(labelId)}`,
      );
      const data = (await res.json()) as {
        messages?: GmailMessage[];
        labelName?: string;
        error?: string;
      };

      if (data.error) {
        toast.error(data.error);
        return;
      }

      const messages = data.messages ?? [];
      if (messages.length === 0) {
        toast.success('Up to date — no new emails found.');
        return;
      }

      // Send delta emails through the standard parse pipeline
      const formData = new FormData();
      formData.set('tripId', tripId);
      formData.set('emails', JSON.stringify(messages));
      formData.set('labelId', labelId);
      if (data.labelName) formData.set('labelName', data.labelName);

      setProgress({ step: 'Preparing…', completed: 0, total: messages.length });

      const parseRes = await fetch('/api/parse', { method: 'POST', body: formData });
      if (!parseRes.ok || !parseRes.body) {
        throw new Error('Sync failed. Please try again.');
      }

      const reader = parseRes.body.getReader();
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
              | { type: 'done'; tripId: string; warnings?: ImportWarning[] }
              | { type: 'error'; message: string };

            if (event.type === 'progress') {
              setProgress({ step: event.step, completed: event.completed, total: event.total });
            } else if (event.type === 'done') {
              router.refresh();
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
      toast.error(err instanceof Error ? err.message : 'Sync failed.');
    } finally {
      setSyncing(null);
      setProgress(null);
    }
  }

  return (
    <>
      <div className="space-y-2">
        <p className="text-xs font-medium text-text-muted uppercase tracking-wide">
          Gmail label syncs
        </p>
        <ul className="space-y-2">
          {labelSyncs.map((sync) => {
            const isSyncing = syncing === sync.labelId;
            return (
              <li
                key={sync.labelId}
                className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3"
              >
                <div className="rounded-md bg-surface p-1.5 shrink-0">
                  <Tag className="h-4 w-4 text-text-muted" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{sync.labelName}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {sync.count} email{sync.count !== 1 ? 's' : ''} · Last synced {formatSyncDate(sync.lastSyncAt)}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSync(sync.labelId)}
                  disabled={syncing !== null}
                  className="shrink-0 gap-1.5"
                >
                  {isSyncing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  {isSyncing ? 'Syncing…' : 'Sync now'}
                </Button>
              </li>
            );
          })}
        </ul>
      </div>

      {progress && (
        <ImportProgress
          step={progress.step}
          completed={progress.completed}
          total={progress.total}
        />
      )}
    </>
  );
}
