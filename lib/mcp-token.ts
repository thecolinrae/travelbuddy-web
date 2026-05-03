import { createHmac, timingSafeEqual } from 'crypto';

function secret(): string {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error('NEXTAUTH_SECRET not set');
  return s;
}

/** Generate a deterministic, HMAC-signed token for a user. No DB needed. */
export function generateMcpToken(userId: string): string {
  const encodedId = Buffer.from(userId).toString('base64url');
  const mac = createHmac('sha256', secret()).update(userId).digest('hex');
  return `${encodedId}.${mac}`;
}

/** Verify an MCP token. Returns userId on success, null on failure. */
export function verifyMcpToken(token: string): string | null {
  try {
    const dot = token.indexOf('.');
    if (dot === -1) return null;
    const encodedId = token.slice(0, dot);
    const mac = token.slice(dot + 1);
    const userId = Buffer.from(encodedId, 'base64url').toString();
    const expected = createHmac('sha256', secret()).update(userId).digest('hex');
    const macBuf = Buffer.from(mac, 'hex');
    const expBuf = Buffer.from(expected, 'hex');
    if (macBuf.length !== expBuf.length) return null;
    return timingSafeEqual(macBuf, expBuf) ? userId : null;
  } catch {
    return null;
  }
}
