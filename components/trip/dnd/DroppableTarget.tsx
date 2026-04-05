'use client';

import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';

interface Props {
  id: string;
  children: React.ReactNode;
}

export function DroppableTarget({ id, children }: Props) {
  const { isOver, setNodeRef } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={cn('rounded-lg transition-shadow', isOver && 'ring-2 ring-primary/60 ring-offset-1')}
    >
      {children}
    </div>
  );
}
