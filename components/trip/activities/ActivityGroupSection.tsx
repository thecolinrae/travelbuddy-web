import { ActivityListItem } from './ActivityListItem';
import type { Activity } from '@/types';

interface ActivityGroupSectionProps {
  label: string;
  activities: Activity[];
  isOwner: boolean;
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
  onEdit,
  onSchedule,
  confirmDelete,
  onDeleteRequest,
  onConfirmDelete,
  onCancelDelete,
}: ActivityGroupSectionProps) {
  return (
    <div className="space-y-2">
      {label && (
        <p className="text-xs font-medium text-text-muted uppercase tracking-wide pb-1">
          {label}
        </p>
      )}
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
    </div>
  );
}
