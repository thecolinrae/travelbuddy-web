import type { Activity, ActivityType, TimelineEvent, HotelCheckInEvent } from '@/types';

// ─── Sort mode ────────────────────────────────────────────────────────────────

export type SortMode = 'city' | 'type' | 'date';

export interface ActivityGroup {
  label: string;
  items: Activity[];
}

// ─── Grouping / sorting ───────────────────────────────────────────────────────

export function groupByCity(activities: Activity[]): ActivityGroup[] {
  const map = new Map<string, Activity[]>();
  const OTHER = 'Other';

  for (const a of activities) {
    const key = a.city?.trim() || OTHER;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(a);
  }

  // Sort alphabetically; push 'Other' to the end
  const sorted = [...map.entries()].sort(([a], [b]) => {
    if (a === OTHER) return 1;
    if (b === OTHER) return -1;
    return a.localeCompare(b);
  });

  return sorted.map(([label, items]) => ({ label, items }));
}

const TYPE_ORDER: ActivityType[] = [
  'sightseeing', 'culture', 'food', 'nature', 'adventure', 'wellness', 'shopping', 'nightlife',
];

const TYPE_LABELS: Record<ActivityType, string> = {
  sightseeing: 'Sightseeing',
  culture:     'Culture',
  food:        'Food & Drink',
  nature:      'Nature',
  adventure:   'Adventure',
  wellness:    'Wellness',
  shopping:    'Shopping',
  nightlife:   'Nightlife',
};

export function groupByType(activities: Activity[]): ActivityGroup[] {
  const map = new Map<ActivityType, Activity[]>();
  for (const t of TYPE_ORDER) map.set(t, []);

  for (const a of activities) {
    const key = TYPE_ORDER.includes(a.type) ? a.type : 'sightseeing';
    map.get(key)!.push(a);
  }

  return TYPE_ORDER
    .filter((t) => (map.get(t)?.length ?? 0) > 0)
    .map((t) => ({ label: TYPE_LABELS[t], items: map.get(t)! }));
}

export function sortByDate(activities: Activity[]): ActivityGroup[] {
  const scheduled = activities
    .filter((a) => a.scheduledDate)
    .sort((a, b) => {
      const dA = a.scheduledDate! + (a.scheduledTime ?? '');
      const dB = b.scheduledDate! + (b.scheduledTime ?? '');
      return dA.localeCompare(dB);
    });

  const unscheduled = activities
    .filter((a) => !a.scheduledDate)
    .sort((a, b) => a.name.localeCompare(b.name));

  const all = [...scheduled, ...unscheduled];
  if (all.length === 0) return [];
  return [{ label: '', items: all }];
}

// ─── City-presence detection ──────────────────────────────────────────────────

export interface CityDateEntry {
  date: string;
  reason: string;
}

function addDay(date: string): string {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Returns a list of dates on which the user is likely in `city`, derived
 * from the trip timeline.  Hotel stays provide the most reliable signal;
 * other non-expense events fill gaps.
 */
export function getCityDateRanges(
  city: string | undefined,
  timeline: TimelineEvent[],
): CityDateEntry[] {
  if (!city?.trim()) return [];
  const targetCity = city.trim().toLowerCase();

  const cityMap = new Map<string, { city: string; reason: string }>();

  // Step 1 — hotel stays (most reliable: fill every night from check-in to check-out)
  for (const event of timeline) {
    if (event.type !== 'hotel' || event.subtype !== 'check_in') continue;
    const hotel = event as HotelCheckInEvent;
    let cursor = hotel.date;
    const end = hotel.checkoutDate;
    while (cursor < end) {
      if (!cityMap.has(cursor)) {
        cityMap.set(cursor, {
          city: hotel.locationCity,
          reason: `Staying at ${hotel.hotelName}`,
        });
      }
      cursor = addDay(cursor);
    }
  }

  // Step 2 — all other non-expense events fill uncovered dates
  for (const event of timeline) {
    if (event.type === 'expense') continue;
    if (event.type === 'hotel') continue; // already handled above
    if (!event.date) continue;
    if (!cityMap.has(event.date)) {
      const reason =
        event.type === 'flight'
          ? event.subtype === 'arrival'
            ? `Flight arrives`
            : `Flight departs`
          : event.type === 'otherTransportation'
          ? `Transport`
          : `Activity`;
      cityMap.set(event.date, { city: event.locationCity, reason });
    }
  }

  // Step 3 — filter to target city and return sorted
  return [...cityMap.entries()]
    .filter(([, v]) => v.city.trim().toLowerCase() === targetCity)
    .map(([date, v]) => ({ date, reason: v.reason }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
