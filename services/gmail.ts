/**
 * Gmail API service (web).
 *
 * accessToken comes from the NextAuth session (server-side):
 *   const session = await auth()
 *   const token = session?.accessToken
 *
 * All functions must be called server-side (API routes / Server Actions).
 */

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1';

export interface GmailMessage {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  body: string;       // plain text for Claude parsing
  htmlBody?: string;  // raw HTML for artifact storage (if available)
}

export interface GmailLabel {
  id: string;
  name: string;
  type: 'system' | 'user';
}

const TRAVEL_QUERY = [
  'subject:(confirmation OR booking OR reservation OR "e-ticket" OR "boarding pass" OR "itinerary")',
  'from:(noreply@expedia.com OR noreply@booking.com OR receipts@united.com OR delta.com OR aa.com OR hotels.com OR airbnb.com OR kayak.com OR orbitz.com OR priceline.com)',
].join(' OR ');

async function gmailRequest<T = unknown>(path: string, accessToken: string): Promise<T> {
  const res = await fetch(`${GMAIL_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    if (res.status === 403) {
      throw new Error('Gmail access not granted. Please sign out and sign in again to re-authorize Gmail access.');
    }
    const text = await res.text();
    throw new Error(`Gmail API error ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

function decodeBase64Url(str: string): string {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  try {
    return decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
  } catch {
    return atob(base64);
  }
}

const MAX_BODY_CHARS = 40_000;

function extractBodies(payload: GmailPayload): { text: string; html?: string } {
  let text = '';
  let html: string | undefined;

  function walk(p: GmailPayload): boolean {
    if (p.body?.data) {
      const decoded = decodeBase64Url(p.body.data);
      if (p.mimeType === 'text/html') {
        if (!html) html = decoded;
        if (!text) text = decoded.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      } else {
        if (!text) text = decoded;
      }
      return true;
    }
    if (p.parts) {
      for (const part of p.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          text = text || decodeBase64Url(part.body.data);
        }
        if (part.mimeType === 'text/html' && part.body?.data) {
          const decoded = decodeBase64Url(part.body.data);
          html = html || decoded;
          text = text || decoded.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        }
      }
      for (const part of p.parts) {
        if (part.parts) walk(part);
      }
    }
    return false;
  }

  walk(payload);

  const cap = (s: string) => s.length > MAX_BODY_CHARS ? s.slice(0, MAX_BODY_CHARS) + '…' : s;
  return { text: cap(text), html: html ? cap(html) : undefined };
}

interface GmailPayload {
  body?: { data?: string };
  parts?: GmailPayload[];
  mimeType?: string;
  headers?: Array<{ name: string; value: string }>;
}

interface GmailFullMessage {
  id: string;
  snippet: string;
  payload: GmailPayload;
}

export async function fetchGmailLabels(accessToken: string): Promise<GmailLabel[]> {
  const res = await gmailRequest<{ labels?: GmailLabel[] }>('/users/me/labels', accessToken);
  const all = res.labels ?? [];
  const KEEP_SYSTEM = new Set(['INBOX', 'STARRED']);
  return all.filter((l) => l.type === 'user' || KEEP_SYSTEM.has(l.id));
}

export interface SearchEmailsOpts {
  labelId?: string;
  customQuery?: string;
}

export async function searchTravelEmails(
  accessToken: string,
  maxResults = 100,
  opts?: SearchEmailsOpts,
): Promise<GmailMessage[]> {
  const after90 = Math.floor(Date.now() / 1000) - 90 * 24 * 60 * 60;
  const after365 = Math.floor(Date.now() / 1000) - 365 * 24 * 60 * 60;

  let query: string;
  if (opts?.customQuery) {
    query = opts.customQuery;
  } else if (opts?.labelId) {
    query = `after:${after365}`;
  } else {
    query = `(${TRAVEL_QUERY} after:${after90}) OR (label:Travel after:${after365})`;
  }

  let listUrl = `/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`;
  if (opts?.labelId) listUrl += `&labelIds=${encodeURIComponent(opts.labelId)}`;

  const listResult = await gmailRequest<{ messages?: Array<{ id: string }> }>(listUrl, accessToken);
  if (!listResult.messages?.length) return [];

  const messages: GmailMessage[] = [];
  for (const { id } of listResult.messages) {
    try {
      const full = await gmailRequest<GmailFullMessage>(
        `/users/me/messages/${id}?format=full`,
        accessToken,
      );
      const headers = full.payload.headers ?? [];
      const subject = headers.find((h) => h.name === 'Subject')?.value ?? '(no subject)';
      const from = headers.find((h) => h.name === 'From')?.value ?? '';
      const date = headers.find((h) => h.name === 'Date')?.value ?? '';
      const { text: body, html: htmlBody } = extractBodies(full.payload);
      messages.push({ id: full.id, subject, from, date, snippet: full.snippet, body, htmlBody });
    } catch {
      // Skip individual message errors
    }
  }

  return messages;
}
