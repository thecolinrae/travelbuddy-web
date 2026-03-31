/**
 * Destination cover photo service.
 *
 * Backed by the Unsplash API. Requires UNSPLASH_ACCESS_KEY in the environment.
 * Returns images.unsplash.com CDN URLs.
 *
 * Server-side only — never import in client components.
 */

/**
 * Fetch a high-quality cover photo URL for a destination.
 *
 * Returns an images.unsplash.com URL, or null if the destination
 * could not be found or UNSPLASH_ACCESS_KEY is not set.
 * images.unsplash.com is already in next.config.ts remotePatterns.
 */
export async function fetchDestinationPhoto(destination: string): Promise<string | null> {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey || !destination.trim()) return null;

  try {
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
  } catch {
    return null; // non-fatal — trips work fine without a cover photo
  }
}
