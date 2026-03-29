'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import type { Activity } from '@/types';

const TYPE_ICONS: Record<string, string> = {
  sightseeing: '🏛', food: '🍽', adventure: '🧗', culture: '🎭',
  shopping: '🛍', nightlife: '🌙', nature: '🌿', wellness: '🧘',
};

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

interface Props {
  tripId: string;
  itineraryMd: string | null;
  isOwner: boolean;
  activities?: Activity[];
}

export function ItineraryTab({ tripId, itineraryMd, isOwner, activities = [] }: Props) {
  const router = useRouter();
  const [regenerating, setRegenerating] = useState(false);

  // Group scheduled activities by date for the inline "Planned" section
  const scheduledByDate = new Map<string, Activity[]>();
  for (const a of activities) {
    if (!a.scheduledDate) continue;
    const bucket = scheduledByDate.get(a.scheduledDate) ?? [];
    bucket.push(a);
    scheduledByDate.set(a.scheduledDate, bucket);
  }
  const scheduledDays = [...scheduledByDate.entries()].sort(([a], [b]) => a.localeCompare(b));

  async function handleRegenerate() {
    setRegenerating(true);
    try {
      await fetch(`/api/trips/${tripId}/regenerate`, { method: 'POST' });
      router.refresh();
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <div className="space-y-4">
      {isOwner && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRegenerate}
            disabled={regenerating}
            className="gap-1.5"
          >
            {regenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {regenerating ? 'Regenerating…' : 'Regenerate'}
          </Button>
        </div>
      )}

      {itineraryMd ? (
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{itineraryMd}</ReactMarkdown>
        </div>
      ) : (
        <div className="py-12 text-center text-muted-foreground text-sm">
          No itinerary generated yet. Add documents to generate one.
        </div>
      )}

      {scheduledDays.length > 0 && (
        <div className="space-y-4 pt-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide border-t pt-4">
            Planned activities
          </h3>
          {scheduledDays.map(([date, acts]) => (
            <div key={date}>
              <p className="text-xs font-medium text-muted-foreground mb-2">{formatDate(date)}</p>
              <ul className="space-y-1.5">
                {acts
                  .slice()
                  .sort((a, b) => (a.scheduledTime ?? '').localeCompare(b.scheduledTime ?? ''))
                  .map((a) => (
                    <li key={a.id} className="flex items-center gap-2.5 rounded-lg border bg-card px-3 py-2">
                      <span className="text-base shrink-0">{TYPE_ICONS[a.type] ?? '📌'}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{a.name}</p>
                        {a.city && <p className="text-xs text-muted-foreground">{a.city}</p>}
                      </div>
                      {a.scheduledTime && (
                        <span className="text-xs text-muted-foreground shrink-0">{a.scheduledTime}</span>
                      )}
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
