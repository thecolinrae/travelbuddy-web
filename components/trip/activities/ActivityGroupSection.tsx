'use client';

import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ActivityListItem } from './ActivityListItem';
import type { Activity } from '@/types';

interface ActivityGroupSectionProps {
  label: string;
  activities: Activity[];
  isOwner: boolean;
  isCollapsed: boolean;
  onToggle: () => void;
  onEdit: (a: Activity) => void;
  onSchedule: (a: Activity) => void;
  confirmDelete: string | null;
  onDeleteRequest: (id: string) => void;
  onConfirmDelete: (id: string) => void;
  onCancelDelete: () => void;
}

export function ActivityGroupSection({
  label,
  activities,
  isOwner,
  isCollapsed,
  onToggle,
  onEdit,
  onSchedule,
  confirmDelete,
  onDeleteRequest,
  onConfirmDelete,
  onCancelDelete,
}: ActivityGroupSectionProps) {
  const collapsible = !!label;

  return (
    <div className="space-y-2">
      {label && (
        <button
          onClick={onToggle}
          className="flex items-center gap-1.5 w-full text-left group"
        >
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 text-text-muted transition-transform duration-150',
              isCollapsed && '-rotate-90',
            )}
          />
          <span className="text-xs font-medium text-text-muted uppercase tracking-wide">
            {label}
          </span>
          <span className="text-xs text-text-light ml-1">
            ({activities.length})
          </span>
        </button>
      )}

      {(!collapsible || !isCollapsed) && (
        <ul className="space-y-3">
          {activities.map((a) => (
            <ActivityListItem
              key={a.id}
              activity={a}
              isOwner={isOwner}
              onEdit={onEdit}
              onDelete={onDeleteRequest}
              onSchedule={onSchedule}
              confirmingDelete={confirmDelete === a.id}
              onConfirmDelete={onConfirmDelete}
              onCancelDelete={onCancelDelete}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
