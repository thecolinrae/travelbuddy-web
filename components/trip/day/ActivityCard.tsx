import {
  Landmark, Utensils, Mountain, Theater, ShoppingBag, Moon, Trees, HeartPulse,
  Circle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { fmt12 } from './utils';
import type { ActivityEvent, Activity, ActivityType } from '@/types';

const CATEGORY_ICONS: Record<ActivityType, React.ComponentType<{ className?: string }>> = {
  sightseeing: Landmark,
  food: Utensils,
  adventure: Mountain,
  culture: Theater,
  shopping: ShoppingBag,
  nightlife: Moon,
  nature: Trees,
  wellness: HeartPulse,
};

const ICON_CLASS = 'h-4 w-4 text-green-700 dark:text-green-400';

function CategoryIcon({ type }: { type: string }) {
  const Icon = CATEGORY_ICONS[type as ActivityType] ?? Circle;
  return <Icon className={ICON_CLASS} />;
}

// ─── Timeline ActivityEvent (confirmed booking) ───────────────────────────────

interface ActivityEventCardProps {
  event: ActivityEvent;
}

export function ActivityEventCard({ event }: ActivityEventCardProps) {
  const highlights = event.highlights?.slice(0, 4) ?? [];

  return (
    <div className="rounded-xl border bg-card px-4 py-3 space-y-2">
      <div className="flex items-start gap-2">
        <CategoryIcon type={event.category} />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-text-base leading-snug">{event.description}</p>
          <p className="text-xs text-text-muted mt-0.5 capitalize">
            {event.category}{event.duration ? ` · ${event.duration}` : ''}
          </p>
        </div>
        {event.time && (
          <span className="text-xs text-text-muted shrink-0 tabular-nums">{fmt12(event.time)}</span>
        )}
      </div>

      {event.tips && (
        <p className="text-sm text-text-muted italic leading-relaxed">{event.tips}</p>
      )}

      {highlights.length > 0 && (
        <ul className="space-y-0.5">
          {highlights.map((h, i) => (
            <li key={i} className="text-sm text-text-muted flex items-start gap-1.5">
              <span className="mt-1.5 h-1 w-1 rounded-full bg-text-muted shrink-0" />
              {h}
            </li>
          ))}
        </ul>
      )}

      {event.bookingRef && (
        <p className="text-xs text-text-muted text-right">{event.bookingRef}</p>
      )}
    </div>
  );
}

// ─── Scheduled Activity (planned, from activities table) ─────────────────────

interface ScheduledActivityCardProps {
  activity: Activity;
}

export function ScheduledActivityCard({ activity }: ScheduledActivityCardProps) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3 space-y-2 opacity-90">
      <div className="flex items-start gap-2">
        <CategoryIcon type={activity.type} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-text-muted leading-snug">{activity.name}</p>
            <Badge variant="outline" className="text-xs font-normal">Planned</Badge>
          </div>
          <p className="text-xs text-text-muted mt-0.5">
            {[activity.city, activity.duration].filter(Boolean).join(' · ')}
          </p>
        </div>
        {activity.scheduledTime && (
          <span className="text-xs text-text-muted shrink-0 tabular-nums">
            {fmt12(activity.scheduledTime)}
          </span>
        )}
      </div>

      {activity.tips && (
        <p className="text-sm text-text-muted italic leading-relaxed">{activity.tips}</p>
      )}
    </div>
  );
}
