/**
 * Database service — Prisma CRUD operations.
 * Replaces the Google Drive file-per-trip persistence model.
 * All functions are server-side only.
 */

import { prisma } from '@/lib/prisma';
import type { TimelineEvent, Activity, BudgetItemCategory } from '@/types';

// ─── Trips ────────────────────────────────────────────────────────────────────

export interface TripRow {
  id: string;
  userId: string;
  name: string;
  destination: string;
  destinations: string[];
  startDate: string | null;
  endDate: string | null;
  status: string;
  coverEmoji: string;
  itineraryMd: string | null;
  budgetGoal: number | null;
  categoryGoals: Partial<Record<BudgetItemCategory, number>> | null;
  preferredCurrency: string;
  ownerEmail: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type TripCreateInput = {
  name: string;
  destination?: string;
  destinations?: string[];
  startDate?: string;
  endDate?: string;
  status?: string;
  coverEmoji?: string;
  itineraryMd?: string;
  budgetGoal?: number;
  categoryGoals?: Partial<Record<BudgetItemCategory, number>>;
  preferredCurrency?: string;
  ownerEmail?: string;
};

export async function createTrip(userId: string, data: TripCreateInput): Promise<TripRow> {
  return prisma.trip.create({
    data: {
      userId,
      name: data.name,
      destination: data.destination ?? '',
      destinations: data.destinations ?? [],
      startDate: data.startDate ?? null,
      endDate: data.endDate ?? null,
      status: data.status ?? 'upcoming',
      coverEmoji: data.coverEmoji ?? '✈️',
      itineraryMd: data.itineraryMd ?? null,
      budgetGoal: data.budgetGoal ?? null,
      categoryGoals: data.categoryGoals ?? undefined,
      preferredCurrency: data.preferredCurrency ?? 'USD',
      ownerEmail: data.ownerEmail ?? null,
    },
  }) as unknown as Promise<TripRow>;
}

export async function updateTrip(
  id: string,
  userId: string,
  data: Partial<TripCreateInput>,
): Promise<TripRow> {
  return prisma.trip.update({
    where: { id, userId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.destination !== undefined && { destination: data.destination }),
      ...(data.destinations !== undefined && { destinations: data.destinations }),
      ...(data.startDate !== undefined && { startDate: data.startDate }),
      ...(data.endDate !== undefined && { endDate: data.endDate }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.coverEmoji !== undefined && { coverEmoji: data.coverEmoji }),
      ...(data.itineraryMd !== undefined && { itineraryMd: data.itineraryMd }),
      ...(data.budgetGoal !== undefined && { budgetGoal: data.budgetGoal }),
      ...(data.categoryGoals !== undefined && { categoryGoals: data.categoryGoals }),
      ...(data.preferredCurrency !== undefined && { preferredCurrency: data.preferredCurrency }),
      ...(data.ownerEmail !== undefined && { ownerEmail: data.ownerEmail }),
    },
  }) as unknown as Promise<TripRow>;
}

export async function deleteTrip(id: string, userId: string): Promise<void> {
  await prisma.trip.delete({ where: { id, userId } });
}

export async function listTrips(userId: string): Promise<TripRow[]> {
  const [owned, shared] = await Promise.all([
    prisma.trip.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.trip.findMany({
      where: { shares: { some: { sharedWithUserId: userId } } },
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  return [...owned, ...shared] as unknown as TripRow[];
}

export async function getTrip(id: string, userId: string): Promise<TripRow | null> {
  const trip = await prisma.trip.findFirst({
    where: {
      id,
      OR: [
        { userId },
        { shares: { some: { sharedWithUserId: userId } } },
      ],
    },
  });
  return trip as unknown as TripRow | null;
}

export async function updateBudgetGoals(
  tripId: string,
  userId: string,
  budgetGoal: number | null,
  categoryGoals: Partial<Record<BudgetItemCategory, number>> | null,
): Promise<void> {
  await prisma.trip.update({
    where: { id: tripId, userId },
    data: {
      budgetGoal,
      categoryGoals: categoryGoals ?? undefined,
    },
  });
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

export async function saveTimeline(tripId: string, events: TimelineEvent[]): Promise<void> {
  // Delete + insert is simpler than upsert for a full timeline replacement
  await prisma.$transaction([
    prisma.timelineEvent.deleteMany({ where: { tripId } }),
    prisma.timelineEvent.createMany({
      data: events.map((e) => ({
        tripId,
        eventType: e.type,
        eventSubtype: 'subtype' in e ? (e as { subtype: string }).subtype : null,
        data: e as object,
        eventDate: e.date ?? null,
        sortUtc: e.utcISO ? new Date(e.utcISO) : null,
        journeyId: e.journeyId ?? null,
        artifactSources: e.artifactSources ?? [],
      })),
    }),
  ]);
}

export async function loadTimeline(tripId: string): Promise<TimelineEvent[]> {
  const rows = await prisma.timelineEvent.findMany({
    where: { tripId },
    orderBy: [{ sortUtc: 'asc' }, { eventDate: 'asc' }],
  });
  return rows.map((r) => r.data as unknown as TimelineEvent);
}

// ─── Activities ───────────────────────────────────────────────────────────────

export async function saveActivities(
  tripId: string,
  destination: string,
  activities: Activity[],
): Promise<void> {
  await prisma.activities.upsert({
    where: { tripId },
    create: { tripId, destination, data: activities as object[] },
    update: { destination, data: activities as object[] },
  });
}

export async function loadActivities(
  tripId: string,
): Promise<{ destination: string; savedActivities: Activity[] } | null> {
  const row = await prisma.activities.findUnique({ where: { tripId } });
  if (!row) return null;
  return {
    destination: row.destination ?? '',
    savedActivities: row.data as unknown as Activity[],
  };
}

// ─── Artifacts ────────────────────────────────────────────────────────────────

export async function createArtifactRecord(
  tripId: string,
  fileName: string,
  mimeType: string,
  storagePath: string,
  size: number,
): Promise<{ id: string }> {
  return prisma.artifact.create({
    data: { tripId, fileName, mimeType, storagePath, size: BigInt(size) },
    select: { id: true },
  });
}

export interface ArtifactRecord {
  id: string;
  fileName: string;
  mimeType: string;
  storagePath: string;
  size: bigint | null;
  createdAt: Date;
}

export async function listArtifacts(tripId: string): Promise<ArtifactRecord[]> {
  return prisma.artifact.findMany({
    where: { tripId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, fileName: true, mimeType: true, storagePath: true, size: true, createdAt: true },
  });
}

export async function deleteArtifactRecord(id: string): Promise<void> {
  await prisma.artifact.delete({ where: { id } });
}

// ─── Sharing ──────────────────────────────────────────────────────────────────

export async function shareTrip(
  tripId: string,
  ownerId: string,
  sharedWithEmail: string,
): Promise<void> {
  // Link to user if they already exist
  const profile = await prisma.profile.findUnique({ where: { email: sharedWithEmail } });
  await prisma.tripShare.upsert({
    where: { tripId_sharedWithEmail: { tripId, sharedWithEmail } },
    create: {
      tripId,
      ownerId,
      sharedWithEmail,
      sharedWithUserId: profile?.id ?? null,
    },
    update: {
      sharedWithUserId: profile?.id ?? null,
    },
  });
}

export async function unshareTrip(tripId: string, sharedWithEmail: string): Promise<void> {
  await prisma.tripShare.deleteMany({ where: { tripId, sharedWithEmail } });
}

export async function listTripShares(
  tripId: string,
): Promise<Array<{ sharedWithEmail: string; createdAt: Date }>> {
  return prisma.tripShare.findMany({
    where: { tripId },
    select: { sharedWithEmail: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
}

/** Called on sign-in: link any pending shares for this email to the new user. */
export async function activatePendingShares(userId: string, email: string): Promise<void> {
  await prisma.tripShare.updateMany({
    where: { sharedWithEmail: email, sharedWithUserId: null },
    data: { sharedWithUserId: userId },
  });
}
