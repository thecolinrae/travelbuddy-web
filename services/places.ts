/**
 * Google Maps Places & Geocoding API — server-side helpers.
 *
 * Uses NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (the same key used by MapTab).
 * All calls are non-fatal: if the API is unavailable or returns no result,
 * callers receive null / safe defaults so imports are never blocked.
 */
import type { TimelineEvent } from '@/types';

interface TextSearchResult {
  name: string;
  formatted_address?: string;
  business_status?: 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY';
  geometry?: {
    location: { lat: number; lng: number };
  };
}

interface TextSearchResponse {
  results: TextSearchResult[];
  status: string;
}

export interface PlaceVerification {
  found: boolean;
  permanentlyClosed: boolean;
  /** Canonical formatted address from Google Maps, e.g. "123 Main St, Paris, France" */
  address?: string;
  lat?: number;
  lng?: number;
  /** The name Google Maps matched — useful to surface discrepancies */
  matchedName?: string;
}

function getKey(): string {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
}

/**
 * Look up a place by name + city and return address/coordinates/status.
 * Non-fatal: returns { found: false } on any error or missing API key.
 */
export async function verifyPlaceAddress(name: string, city: string): Promise<PlaceVerification> {
  const key = getKey();
  if (!key) return { found: false, permanentlyClosed: false };
  try {
    const query = encodeURIComponent(`${name} ${city}`);
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&fields=name,formatted_address,business_status,geometry&key=${key}`;
    const res = await fetch(url, { next: { revalidate: 60 * 60 * 24 } }); // cache 24h
    if (!res.ok) return { found: false, permanentlyClosed: false };
    const data = (await res.json()) as TextSearchResponse;
    const place = data.results[0];
    if (!place) return { found: false, permanentlyClosed: false };
    return {
      found: true,
      permanentlyClosed: place.business_status === 'CLOSED_PERMANENTLY',
      address: place.formatted_address,
      lat: place.geometry?.location.lat,
      lng: place.geometry?.location.lng,
      matchedName: place.name,
    };
  } catch {
    return { found: false, permanentlyClosed: false };
  }
}

// ─── Geocoding ────────────────────────────────────────────────────────────────

interface GeocodeResponse {
  status: string;
  results: Array<{
    formatted_address: string;
    address_components: Array<{ long_name: string; short_name: string; types: string[] }>;
    geometry: { location: { lat: number; lng: number } };
  }>;
}

export interface GeocodedLocation {
  /** Locality-level canonical name, e.g. "Gudvangen" (not the full formatted address). */
  canonical: string;
  lat: number;
  lng: number;
}

/**
 * Resolve a free-text address to a canonical place name + coordinates.
 * Uses the Geocoding API. Results are cached for 7 days — place names don't change.
 * Returns null on any error or missing API key (non-fatal).
 */
export async function geocodeLocation(address: string): Promise<GeocodedLocation | null> {
  const key = getKey();
  if (!key || !address.trim()) return null;
  try {
    const url =
      `https://maps.googleapis.com/maps/api/geocode/json` +
      `?address=${encodeURIComponent(address)}&language=en&key=${key}`;
    const res = await fetch(url, { next: { revalidate: 60 * 60 * 24 * 7 } });
    if (!res.ok) return null;
    const data = (await res.json()) as GeocodeResponse;
    if (data.status !== 'OK' || !data.results[0]) return null;
    const result = data.results[0];
    const { lat, lng } = result.geometry.location;
    // Prefer the locality (city) name; fall back up the hierarchy
    const priority = ['locality', 'administrative_area_level_2', 'administrative_area_level_1'];
    let canonical = '';
    for (const type of priority) {
      const comp = result.address_components.find((c) => c.types.includes(type));
      if (comp) { canonical = comp.long_name; break; }
    }
    if (!canonical) canonical = result.formatted_address;
    console.log(`[geocode] "${address}" → "${canonical}" (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
    return { canonical, lat, lng };
  } catch {
    return null;
  }
}

/**
 * Geocode all unique transport event locations in a timeline and replace
 * `departureLocation`/`arrivalLocation` with canonical names, adding
 * `departurePosition`/`arrivalPosition` coordinates for reliable map rendering.
 *
 * Non-fatal: events whose locations can't be geocoded are left unchanged.
 */
export async function normalizeTransportLocations(
  timeline: TimelineEvent[],
): Promise<TimelineEvent[]> {
  const key = getKey();
  if (!key) return timeline;

  // Collect unique location strings from all transport events
  const locationSet = new Set<string>();
  for (const e of timeline) {
    if (e.type === 'otherTransportation') {
      if (e.departureLocation) locationSet.add(e.departureLocation);
      if (e.arrivalLocation) locationSet.add(e.arrivalLocation);
    }
  }
  if (locationSet.size === 0) return timeline;

  // Geocode all unique locations in parallel
  const locations = [...locationSet];
  const results = await Promise.all(locations.map((loc) => geocodeLocation(loc)));
  const geocodeMap = new Map<string, GeocodedLocation | null>();
  locations.forEach((loc, i) => geocodeMap.set(loc, results[i]));

  // Apply resolved names and coordinates to each transport event
  return timeline.map((e) => {
    if (e.type !== 'otherTransportation') return e;
    const depResolved = geocodeMap.get(e.departureLocation);
    const arrResolved = geocodeMap.get(e.arrivalLocation);
    return {
      ...e,
      ...(depResolved && {
        departureLocation: depResolved.canonical,
        departurePosition: { lat: depResolved.lat, lng: depResolved.lng },
      }),
      ...(arrResolved && {
        arrivalLocation: arrResolved.canonical,
        arrivalPosition: { lat: arrResolved.lat, lng: arrResolved.lng },
      }),
    };
  });
}

/** Returns false only when Places API confirms a place is permanently closed. */
async function isPlaceOpen(name: string, city: string): Promise<boolean> {
  const result = await verifyPlaceAddress(name, city);
  return !result.permanentlyClosed;
}

/**
 * Filters out any activities confirmed as permanently closed by the Places API.
 * Activities without a verifiable address (e.g. "explore the old town") always pass through.
 */
export async function filterOpenPlaces<T extends { name: string; city?: string }>(
  activities: T[],
  fallbackCity: string,
): Promise<T[]> {
  if (!getKey() || activities.length === 0) return activities;
  const checks = await Promise.all(
    activities.map((a) => isPlaceOpen(a.name, a.city ?? fallbackCity)),
  );
  return activities.filter((_, i) => checks[i]);
}
