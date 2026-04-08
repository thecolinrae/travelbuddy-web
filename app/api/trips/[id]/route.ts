import { withTripAuth } from '@/lib/api';
import { updateTrip, deleteTrip } from '@/services/db';
import type { BudgetItemCategory } from '@/types';

export const GET = withTripAuth(async ({ trip }) => {
  return Response.json({
    data: {
      id: trip.id,
      name: trip.name,
      destination: trip.destination,
      destinations: trip.destinations,
      startDate: trip.startDate,
      endDate: trip.endDate,
      status: trip.status,
      coverEmoji: trip.coverEmoji,
      coverPhotoUrl: trip.coverPhotoUrl,
      itineraryMd: trip.itineraryMd,
      notes: trip.notes,
      budgetGoal: trip.budgetGoal,
      categoryGoals: (trip.categoryGoals ?? null) as Partial<Record<BudgetItemCategory, number>> | null,
      preferredCurrency: trip.preferredCurrency,
    },
  });
});

export const PATCH = withTripAuth(async ({ userId, params, request }) => {
  const { id } = params;
  const body = (await request.json()) as {
    name?: string;
    destination?: string;
    destinations?: string[];
    startDate?: string;
    endDate?: string;
    coverEmoji?: string;
    coverPhotoUrl?: string | null;
    status?: string;
    notes?: string | null;
  };

  const updateData = {
    ...body,
    startDate: body.startDate || undefined,
    endDate: body.endDate || undefined,
  };
  const updated = await updateTrip(id, userId, updateData);
  return Response.json({ data: updated });
}, { requireOwner: true });

export const DELETE = withTripAuth(async ({ userId, params }) => {
  const { id } = params;
  await deleteTrip(id, userId);
  return Response.json({ ok: true });
}, { requireOwner: true });
