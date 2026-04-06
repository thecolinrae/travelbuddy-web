'use client';

import { useRef } from 'react';
import { useDraggable } from '@dnd-kit/core';
import {
  GripVertical, ChevronDown, X,
  Compass, Utensils, Zap, Landmark,
  ShoppingBag, Music, TreePine, Heart,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatTime, formatDuration, parseDurationToMinutes } from './utils';
import { useScheduleResize } from './useScheduleResize';
import type { Activity, ActivityType } from '@/types';

// ── Per-type icon + colour ────────────────────────────────────────────────────

interface ActivityStyle {
  Icon: React.ElementType;
  block: string;   // bg + border + text
  icon: string;    // icon colour
  ring: string;    // drag ring
  grip: string;    // grip icon colour
  delete: string;  // delete button bg on hover
}

const ACTIVITY_STYLES: Record<ActivityType, ActivityStyle> = {
  sightseeing: {
    Icon: Compass,
    block: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-800 dark:text-green-300',
    icon:  'text-green-600 dark:text-green-500',
    ring:  'ring-green-400/50',
    grip:  'text-green-500 dark:text-green-600',
    delete:'hover:bg-red-100 dark:hover:bg-red-900/40 hover:text-red-600 dark:hover:text-red-400',
  },
  food: {
    Icon: Utensils,
    block: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300',
    icon:  'text-amber-600 dark:text-amber-500',
    ring:  'ring-amber-400/50',
    grip:  'text-amber-500 dark:text-amber-600',
    delete:'hover:bg-red-100 dark:hover:bg-red-900/40 hover:text-red-600 dark:hover:text-red-400',
  },
  adventure: {
    Icon: Zap,
    block: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300',
    icon:  'text-blue-600 dark:text-blue-500',
    ring:  'ring-blue-400/50',
    grip:  'text-blue-500 dark:text-blue-600',
    delete:'hover:bg-red-100 dark:hover:bg-red-900/40 hover:text-red-600 dark:hover:text-red-400',
  },
  culture: {
    Icon: Landmark,
    block: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800 text-purple-800 dark:text-purple-300',
    icon:  'text-purple-600 dark:text-purple-500',
    ring:  'ring-purple-400/50',
    grip:  'text-purple-500 dark:text-purple-600',
    delete:'hover:bg-red-100 dark:hover:bg-red-900/40 hover:text-red-600 dark:hover:text-red-400',
  },
  shopping: {
    Icon: ShoppingBag,
    block: 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300',
    icon:  'text-rose-600 dark:text-rose-500',
    ring:  'ring-rose-400/50',
    grip:  'text-rose-500 dark:text-rose-600',
    delete:'hover:bg-red-100 dark:hover:bg-red-900/40 hover:text-red-600 dark:hover:text-red-400',
  },
  nightlife: {
    Icon: Music,
    block: 'bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800 text-violet-800 dark:text-violet-300',
    icon:  'text-violet-600 dark:text-violet-500',
    ring:  'ring-violet-400/50',
    grip:  'text-violet-500 dark:text-violet-600',
    delete:'hover:bg-red-100 dark:hover:bg-red-900/40 hover:text-red-600 dark:hover:text-red-400',
  },
  nature: {
    Icon: TreePine,
    block: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300',
    icon:  'text-emerald-600 dark:text-emerald-500',
    ring:  'ring-emerald-400/50',
    grip:  'text-emerald-500 dark:text-emerald-600',
    delete:'hover:bg-red-100 dark:hover:bg-red-900/40 hover:text-red-600 dark:hover:text-red-400',
  },
  wellness: {
    Icon: Heart,
    block: 'bg-pink-50 dark:bg-pink-900/20 border-pink-200 dark:border-pink-800 text-pink-800 dark:text-pink-300',
    icon:  'text-pink-600 dark:text-pink-500',
    ring:  'ring-pink-400/50',
    grip:  'text-pink-500 dark:text-pink-600',
    delete:'hover:bg-red-100 dark:hover:bg-red-900/40 hover:text-red-600 dark:hover:text-red-400',
  },
};

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  activity: Activity;
  top: number;
  height: number;
  columnCount: number;
  columnIndex: number;
  onResizeEnd: (activityId: string, durationMinutes: number) => void;
  onDelete: (activityId: string) => void;
}

export function ScheduleEventBlock({
  activity,
  top,
  height,
  columnCount,
  columnIndex,
  onResizeEnd,
  onDelete,
}: Props) {
  const blockRef = useRef<HTMLDivElement>(null);

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `activity:${activity.id}`,
    data: { activity, originalDate: activity.scheduledDate, originalTime: activity.scheduledTime },
  });

  const { startResize, handleResizeMove, handleResizeUp } = useScheduleResize({ onResizeEnd });

  const style = ACTIVITY_STYLES[activity.type] ?? ACTIVITY_STYLES.sightseeing;
  const { Icon } = style;

  const isShort = height < 40;
  const widthPct = 100 / columnCount;
  const leftPct = columnIndex * widthPct;
  const durationMins = activity.durationMinutes ?? parseDurationToMinutes(activity.duration);

  const blockStyle: React.CSSProperties = {
    top,
    height: Math.max(height, 20),
    left: `${leftPct}%`,
    width: `calc(${widthPct}% - 4px)`,
    zIndex: isDragging ? 50 : 10,
    opacity: isDragging ? 0.35 : 1,
  };

  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        (blockRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }}
      className={cn(
        'absolute rounded-lg border select-none group',
        style.block,
        isDragging && `shadow-xl ring-2 ${style.ring}`,
      )}
      {...listeners}
      {...attributes}
      style={{ ...blockStyle, cursor: isDragging ? 'grabbing' : 'grab' }}
    >
      {/* Grip indicator */}
      <div className={cn(
        'absolute left-0 top-0 bottom-4 w-5 flex items-center justify-center',
        'opacity-0 hover:opacity-100 transition-opacity pointer-events-none',
      )}>
        <GripVertical className={cn('h-3 w-3', style.grip)} />
      </div>

      {/* Delete button — rendered outside the block so it clears overflow */}
      <button
        className={cn(
          'absolute -top-1.5 -right-1.5 z-30 flex items-center justify-center h-5 w-5 rounded-full',
          'opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer',
          'bg-card border border-border shadow-sm text-text-muted',
          style.delete,
        )}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onDelete(activity.id); }}
        aria-label={`Delete ${activity.name}`}
      >
        <X className="h-3 w-3" />
      </button>

      {/* Content */}
      <div className={cn('px-2 py-1 ml-3 pointer-events-none', isShort && 'py-0.5')}>
        <div className="flex items-start gap-1">
          <Icon className={cn('h-3 w-3 shrink-0 mt-0.5', style.icon)} />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold leading-tight truncate">{activity.name}</p>
            {!isShort && (
              <p className="text-xs opacity-60 leading-tight mt-0.5 tabular-nums">
                {activity.scheduledTime ? formatTime(activity.scheduledTime) : ''}
                {' · '}
                {formatDuration(durationMins)}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Resize handle */}
      <div
        className="absolute bottom-0 left-0 right-0 h-4 flex items-end justify-center pb-0.5
                   cursor-ns-resize opacity-0 hover:opacity-100 transition-opacity z-20"
        onPointerDown={(e) => {
          if (blockRef.current) startResize(e, activity, blockRef.current);
        }}
        onPointerMove={handleResizeMove}
        onPointerUp={(e) => {
          if (blockRef.current) handleResizeUp(e);
        }}
        title="Drag to resize"
      >
        <ChevronDown className={cn('h-2.5 w-2.5 pointer-events-none', style.grip)} />
      </div>
    </div>
  );
}

// ── Drag overlay ──────────────────────────────────────────────────────────────

export function ScheduleEventBlockOverlay({
  activity,
  height,
}: {
  activity: Activity;
  height: number;
}) {
  const style = ACTIVITY_STYLES[activity.type] ?? ACTIVITY_STYLES.sightseeing;
  const { Icon } = style;
  const durationMins = activity.durationMinutes ?? parseDurationToMinutes(activity.duration);

  return (
    <div
      className={cn(
        'rounded-lg border shadow-2xl ring-2 px-2 py-1 cursor-grabbing',
        style.block,
        style.ring,
      )}
      style={{ height: Math.max(height, 20), width: 180, opacity: 0.95 }}
    >
      <div className="flex items-start gap-1">
        <Icon className={cn('h-3 w-3 shrink-0 mt-0.5', style.icon)} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold leading-tight truncate">{activity.name}</p>
          <p className="text-xs opacity-60 leading-tight mt-0.5">
            {activity.scheduledTime ? formatTime(activity.scheduledTime) : '9:00am'} ·{' '}
            {formatDuration(durationMins)}
          </p>
        </div>
      </div>
    </div>
  );
}
