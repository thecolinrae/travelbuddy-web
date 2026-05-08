const BASE_URL = process.env.AUTH_HUB_URL!;
const CLIENT_ID = process.env.AUTH_HUB_CLIENT_ID!;
const CLIENT_SECRET = process.env.AUTH_HUB_CLIENT_SECRET!;

function serviceAuthHeader(): string {
  return 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
}

// In-memory secret cache with TTL
const secretCache = new Map<string, { value: string; expiresAt: number }>();
const SECRET_TTL_MS = 5 * 60 * 1000;

export async function getSecret(key: string): Promise<string> {
  const cached = secretCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const res = await fetch(`${BASE_URL}/api/v1/secrets/${encodeURIComponent(key)}`, {
    headers: { Authorization: serviceAuthHeader() },
  });
  if (!res.ok) throw new Error(`auth-hub: secret '${key}' not found (${res.status})`);
  const { value } = await res.json() as { value: string };
  secretCache.set(key, { value, expiresAt: Date.now() + SECRET_TTL_MS });
  return value;
}

export async function getUserGoogleToken(userId: string): Promise<string> {
  const res = await fetch(
    `${BASE_URL}/api/v1/users/${encodeURIComponent(userId)}/tokens/google`,
    { headers: { Authorization: serviceAuthHeader() } },
  );
  if (!res.ok) throw new Error(`auth-hub: Google token not available for user (${res.status})`);
  const { accessToken } = await res.json() as { accessToken: string };
  return accessToken;
}

export interface ConnectorAuthResult {
  connectorId: string;
  scope: string;
  authType: string;
  expiresAt: string | null;
  payload: Record<string, unknown>;
}

export async function getConnectorAuth(connectorId: string, userId?: string): Promise<ConnectorAuthResult | null> {
  const url = new URL(`${BASE_URL}/api/v1/connectors/${encodeURIComponent(connectorId)}/auth`);
  if (userId) url.searchParams.set('userId', userId);

  const res = await fetch(url.toString(), {
    headers: { Authorization: serviceAuthHeader() },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`auth-hub: failed to get connector auth (${res.status})`);
  return res.json() as Promise<ConnectorAuthResult>;
}

export async function getManagedConnectorAuth(
  connectorId: string,
  userId?: string,
): Promise<Record<string, string>> {
  const url = new URL(`${BASE_URL}/api/v1/connectors/${encodeURIComponent(connectorId)}/managed-auth`);
  if (userId) url.searchParams.set('userId', userId);

  const res = await fetch(url.toString(), {
    headers: { Authorization: serviceAuthHeader() },
  });
  if (!res.ok) return {};
  const { headers } = await res.json() as { headers: Record<string, string> };
  return headers ?? {};
}
