import { Pencil, Trash2, CalendarDays, Clock, DollarSign } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CategoryIcon } from '@/components/trip/activityIcons';
import { cn } from '@/lib/utils';
import { fmt12 } from '@/components/trip/day/utils';
import type { Activity } from '@/types';

interface ActivityListItemProps {
  activity: Activity;
  isOwner: boolean;
  onEdit: (a: Activity) => void;
  onDelete: (id: string) => void;
  onSchedule: (a: Activity) => void;
  confirmingDelete: boolean;
  onConfirmDelete: (id: string) => void;
  onCancelDelete: () => void;
}

function formatScheduled(date: string, time?: string): string {
  const d = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  return time ? `${d} at ${fmt12(time)}` : d;
}

export function ActivityListItem({
  activity: a,
  isOwner,
  onEdit,
  onDelete,
  onSchedule,
  confirmingDelete,
  onConfirmDelete,
  onCancelDelete,
}: ActivityListItemProps) {
  return (
    <li className="rounded-xl border bg-card p-4 space-y-2">
      {/* Top row: icon + name + actions */}
      <div className="flex items-start gap-2">
        <CategoryIcon type={a.type} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-text-base leading-snug">{a.name}</p>
          {a.city && <p className="type-caption">{a.city}</p>}
        </div>
        {isOwner && (
          <div className="flex items-center gap-1 shrink-0">
            {confirmingDelete ? (
              <>
                <Button variant="destructive" size="sm" onClick={() => onConfirmDelete(a.id)}>
                  Delete
                </Button>
                <Button variant="ghost" size="sm" onClick={onCancelDelete}>
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onSchedule(a)}
                  className={cn(
                    'text-text-muted hover:text-text-base',
                    a.scheduledDate && 'text-primary-dark',
                  )}
                  title="Schedule"
                >
                  <CalendarDays className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onEdit(a)}
                  className="text-text-muted hover:text-text-base"
                  title="Edit"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDelete(a.id)}
                  className="text-text-muted hover:text-destructive"
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Description */}
      {a.description && (
        <p className="text-sm text-text-muted leading-relaxed line-clamp-2">{a.description}</p>
      )}

      {/* Metadata chips */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {a.estimatedCost && (
          <span className="flex items-center gap-1 text-xs text-text-muted">
            <DollarSign className="h-3 w-3" />{a.estimatedCost}
          </span>
        )}
        {a.duration && (
          <span className="flex items-center gap-1 text-xs text-text-muted">
            <Clock className="h-3 w-3" />{a.duration}
          </span>
        )}
        {a.scheduledDate && (
          <Badge
            variant="outline"
            className="gap-1 bg-primary/10 text-primary-foreground border-primary/30 font-medium text-xs"
          >
            <CalendarDays className="h-3 w-3" />
            {formatScheduled(a.scheduledDate, a.scheduledTime)}
          </Badge>
        )}
      </div>
    </li>
  );
}
