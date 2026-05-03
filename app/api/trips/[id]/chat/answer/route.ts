import { withTripAuth } from '@/lib/api';

const AGENTS_WEB_URL = process.env.AGENTS_WEB_URL?.trim();
const AGENTS_WEB_API_KEY = process.env.AGENTS_WEB_API_KEY?.trim();

export const POST = withTripAuth(async ({ request }) => {
  if (!AGENTS_WEB_URL || !AGENTS_WEB_API_KEY) {
    return Response.json({ error: 'agents-web not configured' }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const { runId, answers } = body ?? {};

  if (!runId || !Array.isArray(answers)) {
    return Response.json({ error: 'runId and answers[] required' }, { status: 400 });
  }

  const res = await fetch(`${AGENTS_WEB_URL}/api/v1/runs/${runId}/answer`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${AGENTS_WEB_API_KEY}`,
    },
    body: JSON.stringify({ answers }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    return Response.json({ error: `agents-web: ${text}` }, { status: res.status });
  }

  return Response.json({ ok: true });
});
