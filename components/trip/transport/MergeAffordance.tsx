'use client';

import { useState } from 'react';
import { GitMerge } from 'lucide-react';

interface Props {
  onMerge: () => void;
}

export function MergeAffordance({ onMerge }: Props) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="relative flex items-center my-4 cursor-default"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className={[
          'flex-1 border-t transition-colors duration-150',
          hovered ? 'border-border' : 'border-transparent',
        ].join(' ')}
      />

      <div
        className={[
          'px-3 transition-opacity duration-150',
          hovered ? 'opacity-100' : 'opacity-0',
        ].join(' ')}
      >
        <button
          onClick={onMerge}
          className="flex items-center gap-1.5 text-xs font-medium text-text-muted hover:text-text-base transition-colors"
          aria-label="Merge legs"
        >
          <GitMerge className="h-3.5 w-3.5" />
          Merge
        </button>
      </div>

      <div
        className={[
          'flex-1 border-t transition-colors duration-150',
          hovered ? 'border-border' : 'border-transparent',
        ].join(' ')}
      />
    </div>
  );
}
