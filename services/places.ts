/**
 * Google Maps Places API — server-side helpers.
 *
 * Uses NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (the same key used by MapTab).
 * All calls are non-fatal: if the API is unavailable or returns no result,
 * the place is assumed to be open so suggestions are never silently dropped.
 */

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
