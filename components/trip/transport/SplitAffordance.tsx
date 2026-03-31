'use client';

import { useState } from 'react';
import { Scissors, Loader2 } from 'lucide-react';

interface Props {
  gap: string | null;
  splitting: boolean;
  onSplit: () => void;
}

export function SplitAffordance({ gap, splitting, onSplit }: Props) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="relative flex items-center my-2 cursor-default group"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Divider line */}
      <div
        className={[
          'flex-1 border-t border-dashed transition-colors duration-150',
          hovered ? 'border-primary' : 'border-border',
        ].join(' ')}
      />

      {/* Center content */}
      <div className="flex items-center gap-2 px-3">
        {splitting ? (
          <Loader2 className="h-4 w-4 text-text-muted animate-spin" />
        ) : hovered ? (
          <button
            onClick={(e) => { e.stopPropagation(); onSplit(); }}
            className="flex items-center gap-1.5 text-xs font-medium text-text-muted hover:text-primary transition-colors"
            aria-label="Split leg here"
          >
            <Scissors className="h-3.5 w-3.5" />
            Split here
          </button>
        ) : gap ? (
          <span className="text-xs text-text-muted whitespace-nowrap">{gap}</span>
        ) : null}
      </div>

      {/* Right side of divider line */}
      <div
        className={[
          'flex-1 border-t border-dashed transition-colors duration-150',
          hovered ? 'border-primary' : 'border-border',
        ].join(' ')}
      />
    </div>
  );
}
