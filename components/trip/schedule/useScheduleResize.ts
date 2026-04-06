'use client';

import { useCallback, useRef } from 'react';
import { heightToMinutes, minutesToHeight, parseDurationToMinutes } from './utils';
import { PIXELS_PER_SNAP } from './constants';
import type { Activity } from '@/types';

interface ResizeState {
  activityId: string;
  startY: number;
  startHeight: number;
  el: HTMLElement;
}

interface ResizeOptions {
  onResizeEnd: (activityId: string, durationMinutes: number) => void;
}

export function useScheduleResize({ onResizeEnd }: ResizeOptions) {
  const stateRef = useRef<ResizeState | null>(null);

  const startResize = useCallback(
    (e: React.PointerEvent, activity: Activity, blockEl: HTMLElement) => {
      e.preventDefault();
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      stateRef.current = {
        activityId: activity.id,
        startY: e.clientY,
        startHeight: minutesToHeight(
          activity.durationMinutes ?? parseDurationToMinutes(activity.duration),
        ),
        el: blockEl,
      };
    },
    [],
  );

  const handleResizeMove = useCallback((e: React.PointerEvent) => {
    const state = stateRef.current;
    if (!state) return;
    const deltaY = e.clientY - state.startY;
    const snapped =
      Math.max(PIXELS_PER_SNAP, Math.round((state.startHeight + deltaY) / PIXELS_PER_SNAP) * PIXELS_PER_SNAP);
    state.el.style.height = `${snapped}px`;
  }, []);

  const handleResizeUp = useCallback(
    (e: React.PointerEvent) => {
      const state = stateRef.current;
      if (!state) return;
      const deltaY = e.clientY - state.startY;
      const snapped =
        Math.max(PIXELS_PER_SNAP, Math.round((state.startHeight + deltaY) / PIXELS_PER_SNAP) * PIXELS_PER_SNAP);
      stateRef.current = null;
      onResizeEnd(state.activityId, heightToMinutes(snapped));
    },
    [onResizeEnd],
  );

  return { startResize, handleResizeMove, handleResizeUp };
}
