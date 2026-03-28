'use client';

import { Loader2 } from 'lucide-react';

interface Props {
  step: string;
  completed: number;
  total: number;
}

export function ImportProgress({ step, completed, total }: Props) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-lg space-y-4">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
          <p className="text-sm font-medium leading-snug">{step}</p>
        </div>
        <div className="space-y-1.5">
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          {total > 1 && (
            <p className="text-xs text-muted-foreground text-right">
              {completed} / {total}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
