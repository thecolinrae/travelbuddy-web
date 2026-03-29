/**
 * Destination cover photo service.
 *
 * Currently backed by Google Places Photos API.
 * To swap in Unsplash: replace fetchDestinationPhoto() and update
 * GOOGLE_MAPS_API_KEY → UNSPLASH_ACCESS_KEY in .env.example.
 *
 * Server-side only — never import in client components.
 */

/**
 * Fetch a high-quality cover photo URL for a destination.
 *
 * Returns a stable lh3.googleusercontent.com CDN URL, or null if the
 * destination could not be found or the API key is not set.
 * lh3.googleusercontent.com is already in next.config.ts remotePatterns.
 */
export async function fetchDestinationPhoto(destination: string): Promise<string | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey || !destination.trim()) return null;

  try {
    // Step 1: Text search to find the place and get a photo reference
    const searchUrl =
      `https://maps.googleapis.com/maps/api/place/textsearch/json` +
      `?query=${encodeURIComponent(destination)}&key=${apiKey}`;
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) return null;

    const searchData = (await searchRes.json()) as {
      results?: Array<{ photos?: Array<{ photo_reference: string }> }>;
    };
    const photoRef = searchData.results?.[0]?.photos?.[0]?.photo_reference;
    if (!photoRef) return null;

    // Step 2: Follow the redirect to get the stable CDN URL
    // Google Places photo endpoint returns a 302 redirect to lh3.googleusercontent.com
    const photoUrl =
      `https://maps.googleapis.com/maps/api/place/photo` +
      `?maxwidth=1200&photo_reference=${encodeURIComponent(photoRef)}&key=${apiKey}`;
    const photoRes = await fetch(photoUrl, { redirect: 'follow' });

    // response.url is the final URL after following the redirect
    const finalUrl = photoRes.url;
    if (!finalUrl || finalUrl.includes('maps.googleapis.com')) return null;
    return finalUrl;
  } catch {
    return null; // non-fatal — trips work fine without a cover photo
  }
}
