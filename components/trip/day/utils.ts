import type { TimelineEvent, Activity, ActivityEvent } from '@/types';

// ─── DayItem discriminated union ─────────────────────────────────────────────

export type DayItem =
  | { kind: 'timeline'; event: TimelineEvent }
  | { kind: 'activity'; activity: Activity }
  | { kind: 'now' };

// ─── fmt12 ────────────────────────────────────────────────────────────────────

export function fmt12(time?: string): string {
  if (!time) return '';
  const [hStr, mStr] = time.split(':');
  const h = parseInt(hStr, 10);
  const m = mStr ?? '00';
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${suffix}`;
}

// ─── fmtUtc ───────────────────────────────────────────────────────────────────

/** Format a UTC ISO string as "MMM D HH:MM UTC" for subtle display. */
export function fmtUtc(utcISO?: string): string {
  if (!utcISO) return '';
  const d = new Date(utcISO);
  const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  const day = d.getUTCDate();
  const h = d.getUTCHours().toString().padStart(2, '0');
  const m = d.getUTCMinutes().toString().padStart(2, '0');
  return `${month} ${day} ${h}:${m} UTC`;
}

// ─── tzAbbr ───────────────────────────────────────────────────────────────────

/**
 * Return a short timezone label (e.g. "EST", "JST", "AEDT") from an IANA
 * timezone name and a local date string (YYYY-MM-DD).
 * Returns empty string if the timezone is unknown or Intl is unavailable.
 */
export function tzAbbr(timezone?: string, localDate?: string): string {
  if (!timezone) return '';
  try {
    const date = localDate ? new Date(localDate + 'T12:00:00') : new Date();
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short',
    }).formatToParts(date);
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
}

// ─── formatDayLabel ───────────────────────────────────────────────────────────

export function formatDayLabel(date: string, tripStartDate: string | null): string {
  const label = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  if (!tripStartDate) return label;
  const start = new Date(tripStartDate + 'T12:00:00');
  const current = new Date(date + 'T12:00:00');
  const diffMs = current.getTime() - start.getTime();
  const dayN = Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
  if (dayN < 1) return label;
  return `${label} · Day ${dayN}`;
}

// ─── buildDayRange ────────────────────────────────────────────────────────────

function addDay(date: string): string {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function buildDayRange(
  startDate: string | null,
  endDate: string | null,
  timeline: TimelineEvent[],
  activities: Activity[],
): string[] {
  const dates: string[] = [];

  for (const e of timeline) {
    if (e.type !== 'expense' && e.date) dates.push(e.date);
  }
  for (const a of activities) {
    if (a.scheduledDate) dates.push(a.scheduledDate);
  }
  if (startDate) dates.push(startDate);
  if (endDate) dates.push(endDate);

  if (dates.length === 0) return [];

  dates.sort();
  let cursor = dates[0];
  const last = dates[dates.length - 1];
  const range: string[] = [];

  while (cursor <= last) {
    range.push(cursor);
    cursor = addDay(cursor);
  }

  return range;
}

// ─── buildDayItems ────────────────────────────────────────────────────────────

/**
 * Return a sort key in epoch milliseconds for a DayItem.
 *
 * Priority:
 *  1. event.utcISO — true UTC timestamp, most accurate
 *  2. event.date + event.time — local datetime, parsed in the browser's timezone
 *  3. activity.scheduledDate + scheduledTime — local datetime
 *  4. Infinity — no time info, sort to end
 */
function getItemSortMs(item: DayItem): number {
  if (item.kind === 'now') return -Infinity;
  if (item.kind === 'activity') {
    const a = item.activity;
    if (a.scheduledDate && a.scheduledTime) return new Date(`${a.scheduledDate}T${a.scheduledTime}`).getTime();
    if (a.scheduledDate) return new Date(`${a.scheduledDate}T23:59:59`).getTime();
    return Infinity;
  }
  const e = item.event;
  if (e.utcISO) return new Date(e.utcISO).getTime();
  if (e.date && e.time) return new Date(`${e.date}T${e.time}`).getTime();
  if (e.date) return new Date(`${e.date}T23:59:59`).getTime();
  return Infinity;
}

export function buildDayItems(
  date: string,
  timeline: TimelineEvent[],
  activities: Activity[],
): DayItem[] {
  const items: DayItem[] = [];

  for (const event of timeline) {
    if (event.type === 'expense') continue;
    if (event.date === date) {
      items.push({ kind: 'timeline', event });
    }
  }

  // Suppress activities whose linked event falls on this date —
  // the enriched ActivityEventCard replaces them in the day view.
  const linkedActivityIds = new Set<string>();
  for (const event of timeline) {
    if (event.type === 'activity' && event.date === date) {
      const linked = (event as ActivityEvent).linkedActivityId;
      if (linked) linkedActivityIds.add(linked);
    }
  }

  for (const activity of activities) {
    if (activity.scheduledDate === date && !linkedActivityIds.has(activity.id)) {
      items.push({ kind: 'activity', activity });
    }
  }

  return items.sort((a, b) => getItemSortMs(a) - getItemSortMs(b));
}

// ─── injectNowIndicator ───────────────────────────────────────────────────────

export function injectNowIndicator(items: DayItem[], nowTime: string): DayItem[] {
  const nowMs = Date.now();
  const insertAt = items.findIndex((item) => {
    const ms = getItemSortMs(item);
    return ms !== Infinity && ms > nowMs;
  });
  const result = [...items];
  if (insertAt === -1) {
    result.push({ kind: 'now' });
  } else {
    result.splice(insertAt, 0, { kind: 'now' });
  }
  return result;
}
