/**
 * Destination cover photo service.
 *
 * Backed by the Wikipedia Pageimages API (no API key required).
 * Returns stable upload.wikimedia.org CDN URLs.
 *
 * Server-side only — never import in client components.
 */

/**
 * Fetch a high-quality cover photo URL for a destination.
 *
 * Returns an upload.wikimedia.org CDN URL, or null if the
 * destination could not be found or has no associated image.
 * upload.wikimedia.org is already in next.config.ts remotePatterns.
 */
export async function fetchDestinationPhoto(destination: string): Promise<string | null> {
  if (!destination.trim()) return null;

  try {
    const url =
      `https://en.wikipedia.org/w/api.php` +
      `?action=query` +
      `&titles=${encodeURIComponent(destination)}` +
      `&prop=pageimages` +
      `&format=json` +
      `&pithumbsize=1200` +
      `&pilicense=any`;

    const res = await fetch(url, {
      headers: { 'User-Agent': 'TravelBuddy/1.0 (travel planning app)' },
    });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      query?: {
        pages?: Record<string, { thumbnail?: { source: string } }>;
      };
    };

    const pages = data.query?.pages;
    if (!pages) return null;

    // Wikipedia returns a single page object keyed by page ID
    const page = Object.values(pages)[0];
    return page?.thumbnail?.source ?? null;
  } catch {
    return null; // non-fatal — trips work fine without a cover photo
  }
}
