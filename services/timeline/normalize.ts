import { resolveTimezone, localToUtcISO } from '../timezone';
import { normalizeLocation } from './utils';
import type { TimelineEvent } from '@/types';

// ─── UTC normalisation ────────────────────────────────────────────────────────

/**
 * Normalize a timeline event's UTC timestamp and timezone.
 *
 * For transport events (flights and other transport) the local time shown to the
 * user is the authoritative value — it's what's printed on the ticket.  We
 * therefore compute utcISO *from* the local date+time using a timezone resolved
 * from the relevant location:
 *   • departure events  → timezone of the departure airport / city
 *   • arrival events    → timezone of the arrival airport / city
 *
 * This is more reliable than trusting UTC values provided by an LLM, which
 * frequently gets offsets wrong for international flights.
 *
 * For all other event types (hotels, activities, etc.) that already have both
 * utcISO and timezone stored, we re-derive local date+time from UTC to keep
 * them consistent.
 */
export function normalizeEvent<T extends TimelineEvent>(e: T): T {
  // Normalize display location strings to Title Case (handles ALL CAPS from LLM output)
  const withNormalizedCity = e.locationCity
    ? { ...e, locationCity: normalizeLocation(e.locationCity) }
    : e;
  const withNormalizedLocations: T =
    withNormalizedCity.type === 'otherTransportation'
      ? {
          ...withNormalizedCity,
          departureLocation: normalizeLocation(withNormalizedCity.departureLocation),
          arrivalLocation: normalizeLocation(withNormalizedCity.arrivalLocation),
        } as T
      : withNormalizedCity as T;
  const normalized = withNormalizedLocations;

  if (normalized.type === 'flight' && (normalized.subtype === 'departure' || normalized.subtype === 'arrival')) {
    const depApt = normalizeLocation(normalized.departureAirport);
    const arrApt = normalizeLocation(normalized.arrivalAirport);
    const withNormalizedAirports = { ...normalized, departureAirport: depApt, arrivalAirport: arrApt } as typeof normalized;
    const locationStr = normalized.subtype === 'departure' ? depApt : arrApt;
    const tz = resolveTimezone(locationStr) ?? withNormalizedAirports.timezone ?? undefined;
    if (tz && withNormalizedAirports.date && withNormalizedAirports.time) {
      const computed = utcForEvent(withNormalizedAirports.date, withNormalizedAirports.time, tz);
      if (computed) return { ...withNormalizedAirports, utcISO: computed, timezone: tz } as T;
    }
    if (tz && !withNormalizedAirports.timezone) return { ...withNormalizedAirports, timezone: tz } as T;
    return withNormalizedAirports as T;
  }

  if (normalized.type === 'otherTransportation') {
    const locationStr = normalized.subtype === 'departure' ? normalized.departureLocation : normalized.arrivalLocation;
    const tz = resolveTimezone(locationStr) ?? normalized.timezone ?? undefined;
    if (tz && normalized.date && normalized.time) {
      const computed = utcForEvent(normalized.date, normalized.time, tz);
      if (computed) return { ...normalized, utcISO: computed, timezone: tz } as T;
    }
    if (tz && !normalized.timezone) return { ...normalized, timezone: tz } as T;
    return normalized;
  }

  // For all other event types (hotel, activity, expense): compute utcISO from
  // local date+time+timezone. Local time is always authoritative — never
  // re-derive local time from a stored utcISO.
  const tz = normalized.timezone;
  if (tz && normalized.date && normalized.time) {
    const computed = utcForEvent(normalized.date, normalized.time, tz);
    if (computed) return { ...normalized, utcISO: computed } as T;
  }
  return normalized;
}

/**
 * Compute utcISO from a local date + time + IANA timezone.
 * Returns undefined when any field is missing so events without a time stay utcISO-free.
 */
export function utcForEvent(
  date: string | undefined,
  time: string | undefined,
  tz: string | null | undefined,
): string | undefined {
  if (!date || !time || !tz) return undefined;
  return localToUtcISO(date, time, tz);
}

/**
 * Advance a YYYY-MM-DD date string by one calendar day (UTC-safe).
 */
export function bumpDay(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Given the previous leg's arrival UTC and a candidate departure local date+time+tz,
 * return the corrected [depDate, depUtcISO] pair.
 *
 * Within a single booking, consecutive legs should connect within ≤24 h.  If the
 * computed gap exceeds 24 h, the LLM has most likely used the wrong timezone's
 * calendar date (common for dateline-crossing itineraries).  Pull the date back
 * by one day and recompute.
 */
export function resolveDeparture(
  depDate: string,
  depTime: string | undefined,
  depTz: string | undefined,
  prevArrUtcISO: string | undefined,
): { date: string; utcISO: string | undefined } {
  let date = depDate;
  let utcISO = utcForEvent(date, depTime, depTz);
  if (prevArrUtcISO && utcISO) {
    const gapMs = new Date(utcISO).getTime() - new Date(prevArrUtcISO).getTime();
    const MIN_CORRECTION_MS = 24 * 60 * 60 * 1000; // 24 h — only correct within this window
    const MAX_CORRECTION_MS = 48 * 60 * 60 * 1000; // 48 h — ignore intentional multi-day stays
    if (gapMs > MIN_CORRECTION_MS && gapMs <= MAX_CORRECTION_MS) {
      // Try pulling back one day
      const d = new Date(date + 'T12:00:00Z');
      d.setUTCDate(d.getUTCDate() - 1);
      const earlier = d.toISOString().slice(0, 10);
      const earlierUtc = utcForEvent(earlier, depTime, depTz);
      if (earlierUtc && earlierUtc >= prevArrUtcISO) {
        // The earlier date still departs after the previous arrival — use it
        date = earlier;
        utcISO = earlierUtc;
      }
    }
  }
  return { date, utcISO };
}

/**
 * Given a departure UTC ISO and a candidate arrival local date+time+tz, return
 * the corrected [arrDate, arrUtcISO] pair.
 *
 * For dateline-crossing flights the LLM sometimes provides an arrival date that
 * is one (or two) days too early, making the computed arrUtcISO fall before the
 * depUtcISO — physically impossible.  We bump the arrival date forward by one
 * day at a time (up to 3 attempts) until the UTC ordering is valid.
 */
export function resolveArrival(
  arrDate: string,
  arrTime: string | undefined,
  arrTz: string | undefined,
  depUtcISO: string | undefined,
): { date: string; utcISO: string | undefined } {
  let date = arrDate;
  let utcISO = utcForEvent(date, arrTime, arrTz);
  if (depUtcISO && utcISO) {
    // Arrival before departure — bump forward (dateline crossing etc.)
    for (let i = 0; i < 3 && utcISO < depUtcISO; i++) {
      date = bumpDay(date);
      utcISO = utcForEvent(date, arrTime, arrTz) ?? utcISO;
    }
    // Arrival too far in the future (24–48h gap) — try pulling back one day
    const gapMs = new Date(utcISO).getTime() - new Date(depUtcISO).getTime();
    if (gapMs > 24 * 60 * 60 * 1000 && gapMs <= 48 * 60 * 60 * 1000) {
      const d = new Date(date + 'T12:00:00Z');
      d.setUTCDate(d.getUTCDate() - 1);
      const earlier = d.toISOString().slice(0, 10);
      const earlierUtc = utcForEvent(earlier, arrTime, arrTz);
      if (earlierUtc && earlierUtc >= depUtcISO) {
        date = earlier;
        utcISO = earlierUtc;
      }
    }
  }
  return { date, utcISO };
}

// ─── Sort key ────────────────────────────────────────────────────────────────

export function eventSortKey(e: TimelineEvent): string {
  return e.utcISO ?? `${e.date}T${e.time ?? '00:00'}`;
}
