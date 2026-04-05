'use client';

import { useState } from 'react';
import { Info, DollarSign, Clock, MapPin, CheckCircle2, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { fmt12 } from './utils';
import { CategoryIcon } from '@/components/trip/activityIcons';
import { ActivityDetailSheet } from './ActivityDetailSheet';
import { EventDetailSheet } from './EventDetailSheet';
import type { ActivityEvent, Activity, TimelineEvent } from '@/types';

// ─── Timeline ActivityEvent (confirmed booking) ───────────────────────────────

interface ActivityEventCardProps {
  event: ActivityEvent;
  linkedActivity?: Activity;
  // Props forwarded to EventDetailSheet for link/unlink actions
  tripId?: string;
  activities?: Activity[];
  timeline?: ActivityEvent[];
  isOwner?: boolean;
  onActivityUpdate?: (updated: Activity[]) => void;
}

export function ActivityEventCard({
  event,
  linkedActivity,
  tripId,
  activities,
  timeline,
  isOwner,
  onActivityUpdate,
}: ActivityEventCardProps) {
  const [open, setOpen] = useState(false);

  // Merge enrichment: prefer event's own data, fall back to linked activity
  const tips = event.tips || linkedActivity?.tips;
  const duration = event.duration || linkedActivity?.duration;
  const highlights = (event.highlights?.length ? event.highlights : linkedActivity?.highlights)?.slice(0, 4) ?? [];

  return (
    <>
      <div className="rounded-xl border bg-card px-4 py-3 space-y-2">
        <div className="flex items-start gap-2">
          <CategoryIcon type={event.category} />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-text-base leading-snug">{event.description}</p>
            {linkedActivity ? (
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400">
                  <CheckCircle2 className="h-3 w-3" />
                  Confirmed
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-text-muted">
                  <Sparkles className="h-3 w-3" />
                  Enriched
                </span>
              </div>
            ) : (
              <p className="text-xs text-text-muted mt-0.5 capitalize">
                {event.category}{duration ? ` · ${duration}` : ''}
              </p>
            )}
          </div>
          {event.time && (
            <span className="text-xs text-text-muted shrink-0 tabular-nums">{fmt12(event.time)}</span>
          )}
          <button
            aria-label="View details"
            onClick={() => setOpen(true)}
            className="shrink-0 text-text-muted hover:text-text-base transition-colors"
          >
            <Info className="h-4 w-4" />
          </button>
        </div>

        {linkedActivity && duration && (
          <p className="text-xs text-text-muted capitalize">{event.category} · {duration}</p>
        )}

        {tips && (
          <p className="text-sm text-text-muted italic leading-relaxed">{tips}</p>
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
      <EventDetailSheet
        open={open}
        onOpenChange={setOpen}
        event={event}
        tripId={tripId}
        activities={activities}
        timeline={timeline}
        isOwner={isOwner}
        onActivityUpdate={onActivityUpdate}
        linkedActivity={linkedActivity}
      />
    </>
  );
}

// ─── Scheduled Activity (planned, from activities table) ─────────────────────

interface ScheduledActivityCardProps {
  activity: Activity;
  tripId: string;
  activities: Activity[];
  timeline?: ActivityEvent[];
  isOwner: boolean;
  onActivityUpdate: (updated: Activity[]) => void;
}

export function ScheduledActivityCard({
  activity,
  tripId,
  activities,
  timeline,
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
        timeline={timeline}
        isOwner={isOwner}
        onActivityUpdate={onActivityUpdate}
      />
    </>
  );
}
