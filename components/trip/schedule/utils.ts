import type { TimelineEvent } from '@/types';
import {
  PIXELS_PER_MINUTE,
  PIXELS_PER_HOUR,
  SNAP_MINUTES,
  GRID_START_MINUTE,
  GRID_END_MINUTE,
  DEFAULT_DURATION_MINUTES,
} from './constants';

// ── Time ↔ pixel conversion ──────────────────────────────────────────────────

/** "HH:MM" → total minutes from midnight */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m ?? 0);
}

/** Total minutes from midnight → "HH:MM" (24h) */
export function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(minutes, 23 * 60 + 59));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** "HH:MM" → px offset from top of grid */
export function timeToY(time: string): number {
  return (timeToMinutes(time) - GRID_START_MINUTE) * PIXELS_PER_MINUTE;
}

/** px offset from top of grid → snapped "HH:MM" */
export function yToTime(y: number): string {
  const rawMinutes = y / PIXELS_PER_MINUTE + GRID_START_MINUTE;
  const snapped = Math.round(rawMinutes / SNAP_MINUTES) * SNAP_MINUTES;
  const clamped = Math.max(GRID_START_MINUTE, Math.min(snapped, GRID_END_MINUTE - 15));
  return minutesToTime(clamped);
}

/** minutes → px height */
export function minutesToHeight(minutes: number): number {
  return Math.max(minutes * PIXELS_PER_MINUTE, PIXELS_PER_HOUR / 4);
}

/** px height → snapped minutes */
export function heightToMinutes(px: number): number {
  const raw = px / PIXELS_PER_MINUTE;
  return Math.max(SNAP_MINUTES, Math.round(raw / SNAP_MINUTES) * SNAP_MINUTES);
}

// ── Duration helpers ──────────────────────────────────────────────────────────

/** Parse freeform duration string ("2 hours", "45 min", "1.5h") → minutes */
export function parseDurationToMinutes(duration: string | undefined): number {
  if (!duration) return DEFAULT_DURATION_MINUTES;
  const lower = duration.toLowerCase();
  const hourMatch = lower.match(/(\d+(?:\.\d+)?)\s*h/);
  const minMatch = lower.match(/(\d+)\s*m/);
  let total = 0;
  if (hourMatch) total += parseFloat(hourMatch[1]) * 60;
  if (minMatch) total += parseInt(minMatch[1], 10);
  return total > 0 ? Math.round(total) : DEFAULT_DURATION_MINUTES;
}

/** Format minutes as human-readable duration string */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

/** Format "HH:MM" → "h:MMam/pm" */
export function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2, '0')}${ampm}`;
}

// ── Date helpers ──────────────────────────────────────────────────────────────

/** Add N days to a YYYY-MM-DD string */
export function addDays(date: string, n: number): string {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Format YYYY-MM-DD → "Mon Apr 7" */
export function formatDateLabel(date: string): string {
  return new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** Format YYYY-MM-DD → "Mon" */
export function formatDayShort(date: string): string {
  return new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' });
}

/** Format YYYY-MM-DD → "Apr 7" */
export function formatMonthDay(date: string): string {
  return new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/** Today's date as YYYY-MM-DD */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Get the Monday of a given date's week */
export function getWeekStart(date: string): string {
  const d = new Date(date + 'T12:00:00');
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday start
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

/** Build an array of N consecutive date strings starting from startDate */
export function buildDateRange(startDate: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(startDate, i));
}

// ── Conflict detection ────────────────────────────────────────────────────────

export interface TimeSlot {
  id: string;
  startMinutes: number;
  endMinutes: number;
}

/** Group overlapping time slots into conflict columns */
export function resolveConflictColumns(slots: TimeSlot[]): Map<string, number> {
  const sorted = [...slots].sort((a, b) => a.startMinutes - b.startMinutes);
  const columns: TimeSlot[][] = [];
  const result = new Map<string, number>();

  for (const slot of sorted) {
    let placed = false;
    for (let col = 0; col < columns.length; col++) {
      const last = columns[col][columns[col].length - 1];
      if (slot.startMinutes >= last.endMinutes) {
        columns[col].push(slot);
        result.set(slot.id, col);
        placed = true;
        break;
      }
    }
    if (!placed) {
      columns.push([slot]);
      result.set(slot.id, columns.length - 1);
    }
  }

  return result;
}

// ── Timezone utilities ────────────────────────────────────────────────────────

/**
 * Date of a timeline event in a given IANA timezone (YYYY-MM-DD).
 * Uses utcISO when available for accurate cross-timezone placement.
 * Falls back to event.date (local departure date) for legacy events without UTC data.
 */
export function eventDateInTz(event: TimelineEvent, tz: string): string {
  if (event.utcISO) {
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      }).formatToParts(new Date(event.utcISO));
      const y  = parts.find((p) => p.type === 'year')?.value;
      const mo = parts.find((p) => p.type === 'month')?.value;
      const d  = parts.find((p) => p.type === 'day')?.value;
      if (y && mo && d) return `${y}-${mo}-${d}`;
    } catch { /* fall through */ }
  }
  return event.date;
}

/** Convert a UTC ISO string to "HH:MM" in an IANA timezone. Returns null on failure. */
export function utcIsoToLocalTime(utcISO: string, tz: string): string | null {
  if (!utcISO || !tz) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date(utcISO));
    const h = parts.find((p) => p.type === 'hour')?.value ?? '00';
    const m = parts.find((p) => p.type === 'minute')?.value ?? '00';
    return h === '24' ? `00:${m}` : `${h}:${m}`;
  } catch { return null; }
}

/** Short timezone abbreviation ("CET", "EST", "AEDT") for a date. Empty string on failure. */
export function getTimezoneAbbr(tz: string, date: string): string {
  if (!tz || !date) return '';
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, timeZoneName: 'short',
    }).formatToParts(new Date(date + 'T12:00:00'));
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
  } catch { return ''; }
}

/** Most-frequent IANA timezone among timeline events on the visible dates.
 *  If no events fall on the visible dates, returns the timezone of the most recent
 *  prior event — so empty days mid-trip stay in the last-known timezone rather than
 *  snapping back to the browser's local timezone. */
export function getPrimaryTimezone(timeline: TimelineEvent[], dates: string[]): string {
  const dateSet = new Set(dates);
  const counts = new Map<string, number>();
  for (const e of timeline) {
    if (e.timezone && dateSet.has(e.date))
      counts.set(e.timezone, (counts.get(e.timezone) ?? 0) + 1);
  }
  if (counts.size > 0)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];

  // No events on visible dates — find most recent prior event with a timezone
  const earliest = [...dateSet].sort()[0];
  if (!earliest) return Intl.DateTimeFormat().resolvedOptions().timeZone;

  const prior = timeline
    .filter((e) => e.timezone && e.date < earliest)
    .sort((a, b) => {
      const dc = b.date.localeCompare(a.date);
      return dc !== 0 ? dc : (b.time ?? '').localeCompare(a.time ?? '');
    });
  if (prior.length > 0) return prior[0].timezone!;

  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** All unique IANA timezones on visible dates, excluding the primary one. */
export function getOtherTimezones(
  timeline: TimelineEvent[], dates: string[], primaryTz: string,
): string[] {
  const dateSet = new Set(dates);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const e of timeline) {
    if (e.timezone && dateSet.has(e.date) && e.timezone !== primaryTz && !seen.has(e.timezone)) {
      seen.add(e.timezone);
      result.push(e.timezone);
    }
  }
  return result;
}

/**
 * Y pixel offset for a timeline event, UTC-aware.
 *
 * Tier 1 — utcISO → local time in primaryTz  (chronologically correct)
 * Tier 2 — utcISO → local time in event's own timezone  (fallback if Tier 1 fails)
 * Tier 3 — event.time raw  (no UTC data — pre-enrichment events)
 *
 * Returns null when no time information is available.
 */
export function eventToGridY(event: TimelineEvent, primaryTz: string): number | null {
  if (event.utcISO) {
    const t = utcIsoToLocalTime(event.utcISO, primaryTz);
    if (t !== null) return timeToY(t);
    if (event.timezone) {
      const t2 = utcIsoToLocalTime(event.utcISO, event.timezone);
      if (t2 !== null) return timeToY(t2);
    }
  }
  if (event.time) return timeToY(event.time);
  return null;
}

/** Current time as minutes-from-midnight in a given IANA timezone. Falls back to browser local time. */
export function nowMinutesInTz(tz: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date());
    const h = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
    const m = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
    return (h === 24 ? 0 : h) * 60 + m;
  } catch {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  }
}
