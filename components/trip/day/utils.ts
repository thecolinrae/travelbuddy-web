import type { TimelineEvent, Activity } from '@/types';

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

function getItemTime(item: DayItem): string | undefined {
  if (item.kind === 'now') return undefined;
  if (item.kind === 'activity') return item.activity.scheduledTime;
  return item.event.time;
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
  for (const activity of activities) {
    if (activity.scheduledDate === date) {
      items.push({ kind: 'activity', activity });
    }
  }

  return items.sort((a, b) => {
    const tA = getItemTime(a);
    const tB = getItemTime(b);
    if (!tA && !tB) return 0;
    if (!tA) return 1;
    if (!tB) return -1;
    return tA.localeCompare(tB);
  });
}

// ─── injectNowIndicator ───────────────────────────────────────────────────────

export function injectNowIndicator(items: DayItem[], nowTime: string): DayItem[] {
  const insertAt = items.findIndex((item) => {
    const t = getItemTime(item);
    return t !== undefined && t > nowTime;
  });
  const result = [...items];
  if (insertAt === -1) {
    result.push({ kind: 'now' });
  } else {
    result.splice(insertAt, 0, { kind: 'now' });
  }
  return result;
}
