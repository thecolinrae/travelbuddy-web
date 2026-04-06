'use client';

import { useState, useMemo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import {
  Compass,
  ChevronDown,
  ChevronUp,
  Utensils,
  Zap,
  Landmark,
  ShoppingBag,
  Music,
  TreePine,
  Heart,
  MapPin,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Activity, ActivityType, TimelineEvent } from '@/types';

// ── Category metadata ─────────────────────────────────────────────────────────

const CATEGORY_META: Record<ActivityType, { label: string; Icon: React.ElementType }> = {
  sightseeing: { label: 'Sightseeing', Icon: Compass },
  culture:     { label: 'Culture',     Icon: Landmark },
  food:        { label: 'Food & Drink', Icon: Utensils },
  adventure:   { label: 'Adventure',   Icon: Zap },
  nature:      { label: 'Nature',      Icon: TreePine },
  shopping:    { label: 'Shopping',    Icon: ShoppingBag },
  wellness:    { label: 'Wellness',    Icon: Heart },
  nightlife:   { label: 'Nightlife',   Icon: Music },
};

// ── City helpers ─────────────────────────────────────────────────────────────

/** "Copenhagen, Denmark" → "copenhagen" */
function normalizeCity(city: string): string {
  return city.split(',')[0].trim().toLowerCase();
}

function cityMatches(activityCity: string, timelineCity: string): boolean {
  const a = normalizeCity(activityCity);
  const b = normalizeCity(timelineCity);
  return a === b || a.includes(b) || b.includes(a);
}

/** Distinct cities that appear in the timeline for the given dates */
function getCitiesInView(timeline: TimelineEvent[], dates: string[]): string[] {
  const dateSet = new Set(dates);
  const seen = new Map<string, string>(); // normalized → display
  for (const e of timeline) {
    if (dateSet.has(e.date) && e.locationCity) {
      const key = normalizeCity(e.locationCity);
      if (!seen.has(key)) seen.set(key, e.locationCity.split(',')[0].trim());
    }
  }
  return Array.from(seen.values());
}

// ── Draggable chip ────────────────────────────────────────────────────────────

function TrayItem({ activity, onDelete }: { activity: Activity; onDelete: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `activity:${activity.id}`,
    data: { activity, originalDate: null, originalTime: null },
  });

  return (
    <div
      className={cn(
        'relative flex items-center rounded-lg border group max-w-[180px]',
        'bg-card border-border hover:border-green-300 dark:hover:border-green-700',
        'hover:bg-green-50 dark:hover:bg-green-900/10 transition-colors select-none',
        isDragging && 'opacity-40 shadow-lg',
      )}
    >
      {/* Drag area */}
      <div
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        className="flex-1 min-w-0 px-2.5 py-1.5 cursor-grab active:cursor-grabbing"
      >
        <p className="text-xs font-medium text-text-base truncate leading-tight pr-3">{activity.name}</p>
        {activity.duration && (
          <p className="text-xs text-text-muted truncate leading-tight">{activity.duration}</p>
        )}
      </div>
      {/* Delete button */}
      <button
        className="absolute top-0.5 right-0.5 flex items-center justify-center h-4 w-4 rounded-sm
                   opacity-0 group-hover:opacity-100 transition-opacity
                   bg-card hover:bg-red-100 dark:hover:bg-red-900/40
                   text-text-muted hover:text-red-600 dark:hover:text-red-400"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onDelete(activity.id); }}
        aria-label={`Delete ${activity.name}`}
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </div>
  );
}

// ── Category section ──────────────────────────────────────────────────────────

function CategorySection({
  type,
  activities,
  onDelete,
}: {
  type: ActivityType;
  activities: Activity[];
  onDelete: (id: string) => void;
}) {
  if (activities.length === 0) return null;
  const { label, Icon } = CATEGORY_META[type];

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3 w-3 text-text-muted shrink-0" />
        <p className="text-xs font-medium text-text-muted uppercase tracking-wide">{label}</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {activities.map((a) => (
          <TrayItem key={a.id} activity={a} onDelete={onDelete} />
        ))}
      </div>
    </div>
  );
}

// ── City panel ────────────────────────────────────────────────────────────────

function CityPanel({ activities, onDelete }: { activities: Activity[]; onDelete: (id: string) => void }) {
  if (activities.length === 0) {
    return (
      <p className="text-xs text-text-muted py-2 text-center opacity-60">
        No unscheduled activities for this city
      </p>
    );
  }

  // Group by category, ordered by count descending
  const byCategory = new Map<ActivityType, Activity[]>();
  for (const a of activities) {
    const key = a.type;
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key)!.push(a);
  }

  const orderedTypes = (Object.keys(CATEGORY_META) as ActivityType[]).filter((t) =>
    byCategory.has(t),
  );
  // Sort by count descending so the biggest categories come first
  orderedTypes.sort((a, b) => (byCategory.get(b)?.length ?? 0) - (byCategory.get(a)?.length ?? 0));

  return (
    <div className="space-y-3">
      {orderedTypes.map((type) => (
        <CategorySection key={type} type={type} activities={byCategory.get(type) ?? []} onDelete={onDelete} />
      ))}
    </div>
  );
}

// ── Main tray ─────────────────────────────────────────────────────────────────

interface Props {
  activities: Activity[];
  dates: string[];
  timeline: TimelineEvent[];
  onDelete: (id: string) => void;
}

export function ScheduleUnscheduledTray({ activities, dates, timeline, onDelete }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [activeCity, setActiveCity] = useState<string | null>(null);

  const citiesInView = useMemo(
    () => getCitiesInView(timeline, dates),
    [timeline, dates],
  );

  // Activities grouped by city — activities with no city appear in every tab
  const activitiesByCity = useMemo(() => {
    const result = new Map<string, Activity[]>();
    for (const city of citiesInView) {
      result.set(
        city,
        activities.filter(
          (a) => !a.city || cityMatches(a.city, city),
        ),
      );
    }
    return result;
  }, [activities, citiesInView]);

  // If no city info at all, just show everything
  const useRawList = citiesInView.length === 0;

  // Default to first city
  const resolvedCity = activeCity ?? citiesInView[0] ?? null;

  const visibleActivities = useRawList
    ? activities
    : (activitiesByCity.get(resolvedCity ?? '') ?? []);

  const totalCount = useRawList
    ? activities.length
    : citiesInView.reduce((sum, c) => sum + (activitiesByCity.get(c)?.length ?? 0), 0);

  if (activities.length === 0) return null;

  return (
    <div className="border-t border-border bg-card shrink-0">
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2 hover:bg-surface transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <p className="text-xs font-medium text-text-muted uppercase tracking-wide shrink-0">
            Unscheduled
          </p>
          <span className="text-xs bg-surface text-text-muted rounded-full px-1.5 py-0.5 tabular-nums shrink-0">
            {totalCount}
          </span>
          {!expanded && !useRawList && citiesInView.length > 0 && (
            <p className="text-xs text-text-muted truncate opacity-60">
              {citiesInView.join(' · ')}
            </p>
          )}
        </div>
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-text-muted shrink-0" />
        ) : (
          <ChevronUp className="h-3.5 w-3.5 text-text-muted shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 max-h-40 overflow-y-auto">
          {/* City tabs — only when 2+ cities */}
          {!useRawList && citiesInView.length > 1 && (
            <div className="flex gap-1.5 flex-wrap -mb-1">
              {citiesInView.map((city) => {
                const count = activitiesByCity.get(city)?.length ?? 0;
                const isActive = city === resolvedCity;
                return (
                  <button
                    key={city}
                    onClick={() => setActiveCity(city)}
                    className={cn(
                      'flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                      isActive
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-card border-border text-text-muted hover:text-text-base hover:border-border',
                    )}
                  >
                    <MapPin className="h-3 w-3 shrink-0" />
                    {city}
                    <span
                      className={cn(
                        'rounded-full px-1 py-0.5 text-xs tabular-nums',
                        isActive ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-surface text-text-muted',
                      )}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Single city label when only one city found */}
          {!useRawList && citiesInView.length === 1 && (
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3 w-3 text-text-muted" />
              <p className="text-xs text-text-muted">{citiesInView[0]}</p>
            </div>
          )}

          {/* Activity grid */}
          <CityPanel activities={visibleActivities} onDelete={onDelete} />

          <p className="text-center text-xs text-text-muted opacity-50 pt-1">
            Drag onto the schedule to place
          </p>
        </div>
      )}
    </div>
  );
}
