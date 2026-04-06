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
  coverPhotoUrl: string | null;
  itineraryMd: string | null;
  notes: string | null;
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
  coverPhotoUrl?: string | null;
  itineraryMd?: string;
  notes?: string | null;
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
      preferredCurrency: data.preferredCurrency ?? 'CAD',
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
      ...(data.coverPhotoUrl !== undefined && { coverPhotoUrl: data.coverPhotoUrl }),
      ...(data.itineraryMd !== undefined && { itineraryMd: data.itineraryMd }),
      ...(data.notes !== undefined && { notes: data.notes }),
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

export async function updateTripCoverPhoto(tripId: string, coverPhotoUrl: string): Promise<void> {
  await prisma.trip.update({ where: { id: tripId }, data: { coverPhotoUrl } });
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

export async function saveTimeline(tripId: string, events: TimelineEvent[]): Promise<void> {
  // Before deleting, snapshot existing legId assignments keyed by event id.
  // This preserves user-assigned leg groupings through re-imports.
  // Note: the DB row id is a Prisma cuid, but event.id is a nanoid stored in the
  // data JSON — they differ. Key the map by data.id (the canonical event identity).
  const existingRows = await prisma.timelineEvent.findMany({
    where: { tripId },
    select: { id: true, legId: true, data: true },
  });
  const legIdByEventId = new Map<string, string | null>(
    existingRows.map((r) => [(r.data as { id?: string }).id ?? r.id, r.legId]),
  );

  await prisma.$transaction([
    prisma.timelineEvent.deleteMany({ where: { tripId } }),
    prisma.timelineEvent.createMany({
      data: events.map((e) => ({
        // Use the event's own id as the DB pk so all service lookups
        // (splitLeg, assignEventToLeg, etc.) can match by event.id directly.
        id: e.id,
        tripId,
        eventType: e.type,
        eventSubtype: 'subtype' in e ? (e as { subtype: string }).subtype : null,
        data: e as object,
        eventDate: e.date ?? null,
        sortUtc: e.utcISO ? new Date(e.utcISO) : null,
        journeyId: e.journeyId ?? null,
        // Restore prior leg assignment; fall back to what's in the event data
        legId: legIdByEventId.get(e.id) ?? e.legId ?? null,
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
  return rows.map((r) => ({
    ...(r.data as unknown as TimelineEvent),
    legId: r.legId ?? undefined,
  }));
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

export interface GmailArtifactMeta {
  gmailMessageId?: string;
  gmailLabelId?: string;
  gmailLabelName?: string;
}

export async function createArtifactRecord(
  tripId: string,
  fileName: string,
  mimeType: string,
  storagePath: string,
  size: number,
  gmail?: GmailArtifactMeta,
): Promise<{ id: string }> {
  return prisma.artifact.create({
    data: {
      tripId,
      fileName,
      mimeType,
      storagePath,
      size: BigInt(size),
      ...(gmail?.gmailMessageId && { gmailMessageId: gmail.gmailMessageId }),
      ...(gmail?.gmailLabelId && { gmailLabelId: gmail.gmailLabelId }),
      ...(gmail?.gmailLabelName && { gmailLabelName: gmail.gmailLabelName }),
    },
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

export interface LabelSync {
  labelId: string;
  labelName: string;
  count: number;
  lastSyncAt: string; // ISO string
}

export async function listArtifacts(tripId: string): Promise<ArtifactRecord[]> {
  return prisma.artifact.findMany({
    where: { tripId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, fileName: true, mimeType: true, storagePath: true, size: true, createdAt: true },
  });
}

export async function listLabelSyncs(tripId: string): Promise<LabelSync[]> {
  const rows = await prisma.artifact.findMany({
    where: { tripId, gmailLabelId: { not: null } },
    select: { gmailLabelId: true, gmailLabelName: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  // Group by labelId in JS
  const map = new Map<string, { labelName: string; count: number; lastSyncAt: Date }>();
  for (const row of rows) {
    if (!row.gmailLabelId) continue;
    const existing = map.get(row.gmailLabelId);
    if (!existing) {
      map.set(row.gmailLabelId, {
        labelName: row.gmailLabelName ?? row.gmailLabelId,
        count: 1,
        lastSyncAt: row.createdAt,
      });
    } else {
      existing.count += 1;
      // rows are ordered desc so the first hit is already the most recent
    }
  }
  return Array.from(map.entries()).map(([labelId, v]) => ({
    labelId,
    labelName: v.labelName,
    count: v.count,
    lastSyncAt: v.lastSyncAt.toISOString(),
  }));
}

export async function getImportedGmailIds(
  tripId: string,
  labelId: string,
): Promise<Set<string>> {
  const rows = await prisma.artifact.findMany({
    where: { tripId, gmailLabelId: labelId, gmailMessageId: { not: null } },
    select: { gmailMessageId: true },
  });
  return new Set(rows.map((r) => r.gmailMessageId!));
}

export async function getArtifact(
  id: string,
): Promise<{ id: string; storagePath: string; tripId: string } | null> {
  return prisma.artifact.findUnique({
    where: { id },
    select: { id: true, storagePath: true, tripId: true },
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
