import { withTripAuth } from '@/lib/api';
import { listLegsWithEvents, createLeg } from '@/services/legs';

// GET /api/trips/[id]/legs — list all legs with events + unassigned events
export const GET = withTripAuth(async ({ params }) => {
  const { id } = params;
  const data = await listLegsWithEvents(id);
  return Response.json(data);
});

// POST /api/trips/[id]/legs — create a new empty leg
export const POST = withTripAuth(async ({ params, request }) => {
  const { id } = params;
  const body = (await request.json()) as { name?: string };

  // New leg goes at the end
  const { legs } = await listLegsWithEvents(id);
  const order = legs.length;

  const leg = await createLeg(id, body.name ?? null, order, !!body.name);
  return Response.json({ leg }, { status: 201 });
}, { requireOwner: true });
