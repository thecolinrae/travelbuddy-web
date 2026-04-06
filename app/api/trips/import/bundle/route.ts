/**
 * Bundle re-import API — POST /api/trips/import/bundle
 *
 * Accepts a TravelBuddy ZIP export file and restores it as a new trip.
 * No AI parsing — this is a direct data restore from a known format.
 *
 * Steps:
 *   1. Parse ZIP, validate $schema
 *   2. Create new Trip record (new id, current userId)
 *   3. Insert timeline events, activities, legs with new tripId
 *   4. For each artifact in artifacts/: re-upload to S3, create Artifact record,
 *      build oldId → newId map
 *   5. Update artifactSources in timeline events to use new IDs
 *   6. Return { tripId: newId }
 */

import { auth } from '@/lib/auth';
import { createTrip, createArtifactRecord, saveTimeline, saveActivities } from '@/services/db';
import { uploadArtifact } from '@/services/storage';
import { autoCreateLegs, createLeg } from '@/services/legs';
import { prisma } from '@/lib/prisma';
import JSZip from 'jszip';
import type { TripExportPayload } from '@/services/export/json';
import { EXPORT_SCHEMA } from '@/services/export/json';

async function getUserId(): Promise<string | null> {
  const session = await auth();
  return (session as { userId?: string })?.userId ?? null;
}

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: 'Invalid multipart form data' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return Response.json({ error: 'Missing file field' }, { status: 400 });
  }

  if (!file.name.endsWith('.zip')) {
    return Response.json({ error: 'File must be a .zip bundle exported by TravelBuddy' }, { status: 400 });
  }

  // Parse ZIP
  let zip: JSZip;
  try {
    const buffer = await file.arrayBuffer();
    zip = await JSZip.loadAsync(buffer);
  } catch {
    return Response.json({ error: 'Could not read ZIP file' }, { status: 400 });
  }

  // Validate and parse trip.json
  const tripJsonFile = zip.file('trip.json');
  if (!tripJsonFile) {
    return Response.json({ error: 'Invalid bundle: missing trip.json' }, { status: 400 });
  }

  let payload: TripExportPayload;
  try {
    const raw = await tripJsonFile.async('string');
    payload = JSON.parse(raw) as TripExportPayload;
  } catch {
    return Response.json({ error: 'Invalid bundle: could not parse trip.json' }, { status: 400 });
  }

  if (payload.$schema !== EXPORT_SCHEMA) {
    return Response.json(
      { error: `Unsupported bundle format: expected "${EXPORT_SCHEMA}", got "${payload.$schema}"` },
      { status: 400 },
    );
  }

  const { trip: exportedTrip, timeline, activities, legs, artifacts: artifactMeta } = payload;

  // ── Create new Trip ───────────────────────────────────────────────────────────
  const newTrip = await createTrip(userId, {
    name: exportedTrip.name,
    destination: exportedTrip.destination,
    destinations: exportedTrip.destinations,
    startDate: exportedTrip.startDate ?? undefined,
    endDate: exportedTrip.endDate ?? undefined,
    status: exportedTrip.status,
    coverEmoji: exportedTrip.coverEmoji,
    coverPhotoUrl: exportedTrip.coverPhotoUrl,
    itineraryMd: exportedTrip.itineraryMd ?? undefined,
    notes: exportedTrip.notes ?? undefined,
    budgetGoal: exportedTrip.budgetGoal ?? undefined,
    categoryGoals: exportedTrip.categoryGoals ?? undefined,
    preferredCurrency: exportedTrip.preferredCurrency,
    ownerEmail: exportedTrip.ownerEmail ?? undefined,
  });

  const newTripId = newTrip.id;

  // ── Re-upload artifacts and build ID map ──────────────────────────────────────
  const artifactIdMap = new Map<string, string>(); // oldId → newId

  for (const meta of artifactMeta) {
    const zipEntry = zip.file(meta.bundlePath);
    if (!zipEntry) continue; // artifact file missing from ZIP — skip

    try {
      const bytes = await zipEntry.async('nodebuffer');
      const storagePath = await uploadArtifact(bytes, meta.fileName, meta.mimeType, newTripId);
      const { id: newArtifactId } = await createArtifactRecord(
        newTripId,
        meta.fileName,
        meta.mimeType,
        storagePath,
        Number(bytes.length),
      );
      artifactIdMap.set(meta.id, newArtifactId);
    } catch {
      // Non-fatal: if an artifact fails to upload, continue with the rest
    }
  }

  // ── Remap artifactSources in timeline events ───────────────────────────────────
  const remappedTimeline = timeline.map((event) => ({
    ...event,
    artifactSources: (event.artifactSources ?? []).map(
      (oldId) => artifactIdMap.get(oldId) ?? oldId,
    ),
  }));

  // ── Save timeline ─────────────────────────────────────────────────────────────
  // Strip legId from events — legs will be re-created below
  const timelineWithoutLegs = remappedTimeline.map((e) => ({ ...e, legId: undefined }));
  await saveTimeline(newTripId, timelineWithoutLegs);

  // ── Save activities ───────────────────────────────────────────────────────────
  if (activities.length > 0) {
    await saveActivities(newTripId, exportedTrip.destination, activities);
  }

  // ── Restore transport legs ────────────────────────────────────────────────────
  // Re-create legs in order, then assign events by matching the original legId
  // from the exported timeline events to the new leg.
  if (legs.length > 0) {
    const legIdMap = new Map<string, string>(); // oldLegId → newLegId

    for (const leg of legs) {
      const newLeg = await createLeg(newTripId, leg.name, leg.order, leg.nameIsCustom);
      legIdMap.set(leg.id, newLeg.id);
    }

    // Assign events to new legs by matching original legId
    for (const event of timeline) {
      if (!event.legId) continue;
      const newLegId = legIdMap.get(event.legId);
      if (!newLegId) continue;
      await prisma.timelineEvent.updateMany({
        where: { tripId: newTripId, id: event.id },
        data: { legId: newLegId },
      });
    }
  } else {
    // No legs in export — auto-create from journeyIds
    await autoCreateLegs(newTripId);
  }

  return Response.json({ tripId: newTripId });
}
