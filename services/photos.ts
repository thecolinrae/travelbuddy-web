/**
 * Destination cover photo service.
 *
 * Primary source: Unsplash API (requires UNSPLASH_ACCESS_KEY).
 * Fallback source: Wikipedia page summary (no API key, upload.wikimedia.org).
 *
 * Server-side only — never import in client components.
 */

/**
 * Try Unsplash first. Returns a landscape photo URL or null.
 */
async function fetchFromUnsplash(destination: string): Promise<string | null> {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) return null;

  const url =
    `https://api.unsplash.com/search/photos` +
    `?query=${encodeURIComponent(destination)}` +
    `&orientation=landscape` +
    `&per_page=1`;

  const res = await fetch(url, {
    headers: { Authorization: `Client-ID ${accessKey}` },
  });
  if (!res.ok) return null;

  const data = (await res.json()) as {
    results?: Array<{ urls?: { regular?: string } }>;
  };

  return data.results?.[0]?.urls?.regular ?? null;
}

/**
 * Fallback: Wikipedia page summary image (upload.wikimedia.org).
 * No API key required. Good coverage of world cities.
 */
async function fetchFromWikipedia(destination: string): Promise<string | null> {
  const res = await fetch(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(destination)}`,
    { headers: { 'User-Agent': 'TravelBuddy/1.0' } },
  );
  if (!res.ok) return null;

  const data = (await res.json()) as {
    thumbnail?: { source?: string };
    originalimage?: { source?: string };
  };

  // Prefer the original (higher resolution) if available
  return data.originalimage?.source ?? data.thumbnail?.source ?? null;
}

/**
 * Fetch multiple photo options for a destination (for the cover photo picker).
 * Returns up to `count` unique URLs from Unsplash + Wikipedia.
 */
export async function fetchDestinationPhotos(
  destination: string,
  count: number = 4,
): Promise<string[]> {
  if (!destination.trim()) return [];

  const results: string[] = [];

  // Unsplash: fetch several landscape options in one request
  try {
    const accessKey = process.env.UNSPLASH_ACCESS_KEY;
    if (accessKey) {
      const url =
        `https://api.unsplash.com/search/photos` +
        `?query=${encodeURIComponent(destination)}` +
        `&orientation=landscape` +
        `&per_page=${count}`;
      const res = await fetch(url, {
        headers: { Authorization: `Client-ID ${accessKey}` },
      });
      if (res.ok) {
        const data = (await res.json()) as {
          results?: Array<{ urls?: { regular?: string } }>;
        };
        for (const r of data.results ?? []) {
          if (r.urls?.regular) results.push(r.urls.regular);
        }
      }
    }
  } catch { /* non-fatal */ }

  // Wikipedia: add one more option if we have room
  if (results.length < count) {
    try {
      const wiki = await fetchFromWikipedia(destination);
      if (wiki && !results.includes(wiki)) results.push(wiki);
    } catch { /* non-fatal */ }
  }

  return results.slice(0, count);
}

/**
 * Fetch a cover photo URL for a destination.
 *
 * Tries Unsplash first; falls back to Wikipedia on failure or no result.
 * Returns null if neither source has an image — trips work fine without one.
 */
export async function fetchDestinationPhoto(destination: string): Promise<string | null> {
  if (!destination.trim()) return null;

  try {
    const unsplash = await fetchFromUnsplash(destination);
    if (unsplash) return unsplash;
  } catch {
    // fall through to Wikipedia
  }

  try {
    return await fetchFromWikipedia(destination);
  } catch {
    return null;
  }
}
