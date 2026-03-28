/** Generate a URL-safe unique ID using the Web Crypto API (works in Node.js and browsers). */
export function nanoid(size = 21): string {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(bytes)
    .map((b) => chars[b % chars.length])
    .join('');
}
