// ─── String helpers ────────────────────────────────────────────────────────────

/** Strip trailing airport codes like "(YYZ)", "(LHR)", "(EGLL)". */
export function stripAirportCode(s: string): string {
  return s.replace(/\s*\([A-Z]{3,4}\)\s*$/, '').trim();
}

/**
 * Normalize a display location string to Title Case if it looks like ALL CAPS.
 * Leaves already-mixed-case strings (e.g. "New York", "São Paulo") untouched.
 * Short all-caps strings that look like airport/country codes (≤4 chars) are
 * also left alone so "YYZ" or "NRT" aren't converted to "Yyz".
 */
export function normalizeLocation(s: string): string {
  if (!s) return s;
  const letters = s.replace(/[^a-zA-Z]/g, '');
  if (letters.length <= 4) return s; // likely a code — leave as-is
  const upperRatio = letters.replace(/[^A-Z]/g, '').length / letters.length;
  if (upperRatio < 0.8) return s; // already mixed case
  return s
    .toLowerCase()
    .replace(/(^|[\s\-\/])(\p{L})/gu, (_, sep, c) => sep + c.toUpperCase());
}

/** Extract an IATA/ICAO code from strings like "Toronto (YYZ)" → "YYZ". */
export function extractAirportCode(s: string): string | null {
  return s.match(/\(([A-Z]{3,4})\)\s*$/)?.[1] ?? null;
}

/**
 * True if two airport/location strings refer to the same airport.
 * Compares by code when both have one; falls back to city-name comparison.
 */
export function airportsMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  const cA = extractAirportCode(a);
  const cB = extractAirportCode(b);
  if (cA && cB) return cA === cB;
  return stripAirportCode(a).toLowerCase() === stripAirportCode(b).toLowerCase();
}

/**
 * Try to extract a city name from a hotel name when the destination field is missing.
 * Handles common patterns:
 *   "Marriott Tokyo"            → "Tokyo"
 *   "The Langham, Shanghai"     → "Shanghai"
 *   "Westin Paris – Vendôme"    → "Paris"
 *   "Hilton London Kensington"  → "London"
 */
export function inferCityFromHotelName(name: string): string {
  if (!name) return '';
  // "Mandarin Oriental, Bangkok" — take everything after the comma
  const commaIdx = name.indexOf(',');
  if (commaIdx !== -1) {
    const afterComma = name.slice(commaIdx + 1).split(/[–—-]/)[0].trim();
    if (afterComma && afterComma.length < 30 && !/\d/.test(afterComma)) return afterComma;
  }
  // Strip chain names and generic hotel words, then return the first remaining proper noun
  const stripped = name
    .replace(/\b(marriott|hilton|hyatt|sheraton|westin|intercontinental|fairmont|ritz[- ]?carlton|four seasons|mandarin oriental|peninsula|sofitel|novotel|ibis|pullman|doubletree|courtyard|hampton inn|holiday inn|crowne plaza|radisson blu|aloft|w hotel|le méridien)\b/gi, '')
    .replace(/\b(hotel|the|grand|royal|palace|towers?|suites?|boutique|resort|collection|autograph|tribute|express|inn|spa|by|at|of|and|le|la|les|de|du)\b/gi, '')
    .replace(/[–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = stripped.split(' ').filter((w) => /^[A-Z][a-zA-ZÀ-ÿ]{1,}$/.test(w) && w.length > 2);
  return words[0] ?? '';
}
