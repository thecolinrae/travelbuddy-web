// Grid geometry — 1px per minute at default scale
export const PIXELS_PER_MINUTE = 1;
export const PIXELS_PER_HOUR = 60;
export const SNAP_MINUTES = 15;
export const PIXELS_PER_SNAP = SNAP_MINUTES * PIXELS_PER_MINUTE;

// Visible grid window
export const GRID_START_HOUR = 6;   // 6am
export const GRID_END_HOUR = 23;    // 11pm
export const GRID_START_MINUTE = GRID_START_HOUR * 60;
export const GRID_END_MINUTE = GRID_END_HOUR * 60;
export const GRID_TOTAL_MINUTES = GRID_END_MINUTE - GRID_START_MINUTE;
export const GRID_HEIGHT = GRID_TOTAL_MINUTES * PIXELS_PER_MINUTE;

// Default duration when unknown
export const DEFAULT_DURATION_MINUTES = 60;

export type ScheduleView = 'day' | '3day' | 'week';
