import { useCallback } from 'react';
import {
  timeToY,
  yToTime,
  minutesToHeight,
  heightToMinutes,
  parseDurationToMinutes,
} from './utils';
import { PIXELS_PER_SNAP, SNAP_MINUTES } from './constants';
import type { Activity } from '@/types';

export function useScheduleGrid() {
  const snapY = useCallback((y: number) => {
    return Math.round(y / PIXELS_PER_SNAP) * PIXELS_PER_SNAP;
  }, []);

  const getActivityTop = useCallback((activity: Activity): number => {
    const time = activity.scheduledTime ?? '09:00';
    return timeToY(time);
  }, []);

  const getActivityHeight = useCallback((activity: Activity): number => {
    const mins = activity.durationMinutes ?? parseDurationToMinutes(activity.duration);
    return minutesToHeight(mins);
  }, []);

  return {
    timeToY,
    yToTime,
    minutesToHeight,
    heightToMinutes,
    snapY,
    getActivityTop,
    getActivityHeight,
    PIXELS_PER_SNAP,
    SNAP_MINUTES,
  };
}
