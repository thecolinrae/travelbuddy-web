'use client';

import { useState } from 'react';
import { Info, DollarSign, Clock, MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { fmt12 } from './utils';
import { CategoryIcon } from '@/components/trip/activityIcons';
import { ActivityDetailSheet } from './ActivityDetailSheet';
import type { ActivityEvent, Activity } from '@/types';

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
  tripId: string;
  activities: Activity[];
  isOwner: boolean;
  onActivityUpdate: (updated: Activity[]) => void;
}

export function ScheduledActivityCard({
  activity,
  tripId,
  activities,
  isOwner,
  onActivityUpdate,
}: ScheduledActivityCardProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  const hasMetadata = !!(activity.estimatedCost || activity.duration || activity.address || activity.city);

  return (
    <>
      <div className="rounded-xl border bg-card px-4 py-3 space-y-2 opacity-90">
        {/* Row 1: icon + name + badge + time + info button */}
        <div className="flex items-start gap-2">
          <CategoryIcon type={activity.type} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium text-text-muted leading-snug">{activity.name}</p>
              <Badge variant="outline" className="text-xs font-normal">Planned</Badge>
            </div>
          </div>
          {activity.scheduledTime && (
            <span className="text-xs text-text-muted shrink-0 tabular-nums">
              {fmt12(activity.scheduledTime)}
            </span>
          )}
          <button
            aria-label="View details"
            onClick={() => setSheetOpen(true)}
            className="shrink-0 text-text-muted hover:text-text-base transition-colors"
          >
            <Info className="h-4 w-4" />
          </button>
        </div>

        {/* Row 2: metadata chips */}
        {hasMetadata && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {activity.estimatedCost && (
              <span className="flex items-center gap-1 text-xs text-text-muted">
                <DollarSign className="h-3 w-3" />{activity.estimatedCost}
              </span>
            )}
            {activity.duration && (
              <span className="flex items-center gap-1 text-xs text-text-muted">
                <Clock className="h-3 w-3" />{activity.duration}
              </span>
            )}
            {(activity.address || activity.city) && (
              <span className="flex items-center gap-1 text-xs text-text-muted truncate max-w-[14rem]">
                <MapPin className="h-3 w-3 shrink-0" />{activity.address ?? activity.city}
              </span>
            )}
          </div>
        )}

        {/* Row 3: tips (single line) */}
        {activity.tips && (
          <p className="text-sm text-text-muted italic leading-relaxed line-clamp-1">
            {activity.tips}
          </p>
        )}
      </div>

      <ActivityDetailSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        activity={activity}
        tripId={tripId}
        activities={activities}
        isOwner={isOwner}
        onActivityUpdate={onActivityUpdate}
      />
    </>
  );
}
