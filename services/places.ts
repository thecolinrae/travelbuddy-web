/**
 * Google Maps Places API — server-side helpers.
 *
 * Uses NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (the same key used by MapTab).
 * All calls are non-fatal: if the API is unavailable or returns no result,
 * the place is assumed to be open so suggestions are never silently dropped.
 */

interface TextSearchResult {
  name: string;
  business_status?: 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY';
}

interface TextSearchResponse {
  results: TextSearchResult[];
  status: string;
}

function getKey(): string {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
}

/** Returns false only when Places API confirms a place is permanently closed. */
async function isPlaceOpen(name: string, city: string): Promise<boolean> {
  const key = getKey();
  if (!key) return true;
  try {
    const query = encodeURIComponent(`${name} ${city}`);
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&key=${key}`;
    const res = await fetch(url, { next: { revalidate: 60 * 60 * 24 } }); // cache 24h
    if (!res.ok) return true;
    const data = (await res.json()) as TextSearchResponse;
    const place = data.results[0];
    if (!place) return true;
    return place.business_status !== 'CLOSED_PERMANENTLY';
  } catch {
    return true;
  }
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
