import { auth } from '@/lib/auth';
import { getTrip } from '@/services/db';
import type { TripRow } from '@/services/db';

export type TripHandlerCtx = {
  userId: string;
  trip: TripRow;
  params: Record<string, string>;
  request: Request;
};

export function apiError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

export async function getUserId(): Promise<string | null> {
  const session = await auth();
  return (session as { userId?: string })?.userId ?? null;
}

/**
 * Wraps a trip-scoped route handler with auth + trip ownership checks.
 *
 * Usage:
 *   export const GET = withTripAuth(async ({ userId, trip, params, request }) => { ... });
 *   export const POST = withTripAuth(async ({ ... }) => { ... }, { requireOwner: true });
 *
 * By default (no options), any authenticated user who can access the trip (owner
 * or shared user) is allowed. Pass { requireOwner: true } for mutation routes.
 */
export function withTripAuth(
  handler: (ctx: TripHandlerCtx) => Promise<Response>,
  options?: { requireOwner?: boolean },
) {
  return async (
    request: Request,
    { params }: { params: Promise<Record<string, string>> },
  ): Promise<Response> => {
    const resolvedParams = await params;
    const userId = await getUserId();
    if (!userId) return apiError('Unauthorized', 401);

    const trip = await getTrip(resolvedParams.id, userId);
    if (!trip) return apiError('Not found', 404);
    if (options?.requireOwner && trip.userId !== userId) return apiError('Forbidden', 403);

    return handler({ userId, trip, params: resolvedParams, request });
  };
}
