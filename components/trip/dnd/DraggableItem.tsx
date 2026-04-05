'use client';

import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

interface Props {
  id: string;
  disabled?: boolean;
  children: (handle: React.ReactNode) => React.ReactNode;
}

export function DraggableItem({ id, disabled = false, children }: Props) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } =
    useDraggable({ id, disabled });

  const handle = disabled ? null : (
    <button
      ref={setActivatorNodeRef}
      {...listeners}
      {...attributes}
      className="cursor-grab active:cursor-grabbing text-text-muted hover:text-text-base transition-colors p-0.5 shrink-0"
      aria-label="Drag to merge with another activity"
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform) }}
      className={isDragging ? 'opacity-40' : undefined}
    >
      {children(handle)}
    </div>
  );
}
