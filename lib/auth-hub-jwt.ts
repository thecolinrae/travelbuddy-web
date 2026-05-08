import { createRemoteJWKSet, jwtVerify } from 'jose';

const AUTH_HUB_URL = process.env.AUTH_HUB_URL!;

// createRemoteJWKSet caches keys internally and handles rotation
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
  if (!jwks) jwks = createRemoteJWKSet(new URL(`${AUTH_HUB_URL}/oauth/jwks`));
  return jwks;
}

/** Verify a JWT issued by auth-hub. Returns the userId (sub claim) on success, null on failure. */
export async function verifyAuthHubToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      issuer: AUTH_HUB_URL,
      algorithms: ['RS256'],
    });
    return (payload.sub as string) ?? null;
  } catch {
    return null;
  }
}
