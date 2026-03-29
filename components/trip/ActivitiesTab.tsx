'use client';

import type { Activity } from '@/types';

const TYPE_ICONS: Record<string, string> = {
  sightseeing: '🏛',
  food: '🍽',
  adventure: '🧗',
  culture: '🎭',
  shopping: '🛍',
  nightlife: '🌙',
  nature: '🌿',
  wellness: '🧘',
};

interface Props {
  activities: Activity[];
}

export function ActivitiesTab({ activities }: Props) {
  const saved = activities.filter((a) => a.saved);

  if (saved.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground text-sm">
        No saved activities yet.
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {saved.map((a) => (
        <li key={a.id} className="rounded-xl border bg-card p-4 space-y-1.5">
          <div className="flex items-start gap-2">
            <span className="text-lg leading-none mt-0.5 shrink-0">{TYPE_ICONS[a.type] ?? '📌'}</span>
            <div className="min-w-0">
              <p className="font-medium text-sm">{a.name}</p>
              {a.city && <p className="text-xs text-muted-foreground">{a.city}</p>}
            </div>
          </div>
          {a.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">{a.description}</p>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {a.estimatedCost && (
              <span className="text-xs text-muted-foreground">💰 {a.estimatedCost}</span>
            )}
            {a.duration && (
              <span className="text-xs text-muted-foreground">⏱ {a.duration}</span>
            )}
            {a.scheduledDate && (
              <span className="text-xs text-primary font-medium">
                📅 {new Date(a.scheduledDate + 'T12:00:00').toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric',
                })}
                {a.scheduledTime ? ` at ${a.scheduledTime}` : ''}
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
