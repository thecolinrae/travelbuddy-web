/**
 * Transport legs service.
 *
 * Handles auto-creation, naming, and CRUD for TransportLeg records.
 * Legs are user-defined groupings of transport events that represent
 * one continuous journey (e.g. "AUS → NRT" with one or more segments).
 */

import { prisma } from '@/lib/prisma';
import { airportsMatch } from './timeline/utils';
import type { TimelineEvent, TransportLeg } from '@/types';

// ─── Name generation ──────────────────────────────────────────────────────────

/** Extract the best short location label from a transport event. */
function eventOrigin(e: TimelineEvent): string {
  if (e.type === 'flight') {
    if (e.subtype === 'departure') return e.departureAirport;
    if (e.subtype === 'arrival') return e.departureAirport;
  }
  if (e.type === 'otherTransportation') {
    return e.departureLocation;
  }
  return e.locationCity;
}

function eventDestination(e: TimelineEvent): string {
  if (e.type === 'flight') {
    if (e.subtype === 'departure') return e.arrivalAirport;
    if (e.subtype === 'arrival') return e.arrivalAirport;
  }
  if (e.type === 'otherTransportation') {
    return e.arrivalLocation;
  }
  return e.locationCity;
}

/**
 * Strip trailing "(XXX)" airport codes from location strings for display.
 * "Toronto (YYZ)" → "Toronto", "YYZ" stays as "YYZ"
 */
function shortLabel(s: string): string {
  // If it's already a bare IATA code (3 caps), keep it
  if (/^[A-Z]{3}$/.test(s.trim())) return s.trim();
  // Strip trailing parenthetical
  const stripped = s.replace(/\s*\([A-Z]{3,4}\)\s*$/, '').trim();
  return stripped || s.trim();
}

/**
 * Generate a human-readable leg name from its ordered events.
 * Flight legs use IATA codes; others use city names.
 * Example: "AUS → NRT" or "Austin → Dallas"
 */
export function generateLegName(events: TimelineEvent[]): string {
  const transport = events.filter(
    (e) => e.type === 'flight' || e.type === 'otherTransportation',
  );
  if (transport.length === 0) return 'Transport';

  const first = transport[0];
  const last = transport[transport.length - 1];

  const origin = shortLabel(eventOrigin(first));
  const destination = shortLabel(eventDestination(last));

  if (!origin && !destination) return 'Transport';
  if (!destination || origin === destination) return origin || 'Transport';
  return `${origin} → ${destination}`;
}

// ─── DB helpers ──────────────────────────────────────────────────────────────

export interface LegRow {
  id: string;
  tripId: string;
  name: string | null;
  nameIsCustom: boolean;
  order: number;
  createdAt: Date;
}

export async function listLegs(tripId: string): Promise<LegRow[]> {
  return prisma.transportLeg.findMany({
    where: { tripId },
    orderBy: { order: 'asc' },
  }) as unknown as LegRow[];
}

export async function getLeg(legId: string): Promise<LegRow | null> {
  return prisma.transportLeg.findUnique({
    where: { id: legId },
  }) as unknown as LegRow | null;
}

export async function createLeg(
  tripId: string,
  name: string | null,
  order: number,
  nameIsCustom = false,
): Promise<LegRow> {
  return prisma.transportLeg.create({
    data: { tripId, name, nameIsCustom, order },
  }) as unknown as LegRow;
}

export async function updateLeg(
  legId: string,
  data: { name?: string; nameIsCustom?: boolean; order?: number },
): Promise<LegRow> {
  return prisma.transportLeg.update({
    where: { id: legId },
    data,
  }) as unknown as LegRow;
}

export async function deleteLeg(legId: string): Promise<void> {
  await prisma.$transaction([
    // Unassign events belonging to this leg
    prisma.timelineEvent.updateMany({
      where: { legId },
      data: { legId: null },
    }),
    prisma.transportLeg.delete({ where: { id: legId } }),
  ]);
}

/** Reassign a timeline event to a different leg (or unassign with null). */
export async function assignEventToLeg(
  tripId: string,
  eventId: string,
  legId: string | null,
): Promise<void> {
  // Match by the event's own id, which may be stored in data->>'id' (old rows)
  // or directly as the DB pk (rows saved after the id-alignment fix).
  // Raw SQL handles both cases with a single query.
  if (legId !== null) {
    await prisma.$executeRaw`
      UPDATE "TimelineEvent"
      SET "legId" = ${legId}
      WHERE "tripId" = ${tripId}
        AND (id = ${eventId} OR data->>'id' = ${eventId})
    `;
  } else {
    await prisma.$executeRaw`
      UPDATE "TimelineEvent"
      SET "legId" = NULL
      WHERE "tripId" = ${tripId}
        AND (id = ${eventId} OR data->>'id' = ${eventId})
    `;
  }
}

/** Shift all legs with order >= startOrder up by 1. */
async function shiftLegsUp(tripId: string, startOrder: number): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "TransportLeg"
    SET "order" = "order" + 1
    WHERE "tripId" = ${tripId} AND "order" >= ${startOrder}
  `;
}

/** Close a gap in order values after a delete/merge. */
async function renumberLegs(tripId: string): Promise<void> {
  const legs = await prisma.transportLeg.findMany({
    where: { tripId },
    orderBy: { order: 'asc' },
    select: { id: true },
  });
  await prisma.$transaction(
    legs.map((leg, i) =>
      prisma.transportLeg.update({ where: { id: leg.id }, data: { order: i } }),
    ),
  );
}

// ─── Auto-creation ────────────────────────────────────────────────────────────

/**
 * After a timeline save, scan all transport events for the trip and ensure
 * each journeyId group has a corresponding TransportLeg.
 *
 * - Only creates legs for journeyIds that don't already have one.
 * - Sets legId on the TimelineEvent DB rows.
 * - Re-imports are safe: existing leg assignments are left untouched.
 */
export async function autoCreateLegs(tripId: string): Promise<void> {
  // Load all transport events for this trip
  const rows = await prisma.timelineEvent.findMany({
    where: {
      tripId,
      eventType: { in: ['flight', 'otherTransportation'] },
    },
    orderBy: [{ sortUtc: 'asc' }, { eventDate: 'asc' }],
    select: { id: true, journeyId: true, legId: true, data: true },
  });

  if (rows.length === 0) return;

  // Find journeyIds that don't yet have a leg
  const existingLegs = await prisma.transportLeg.findMany({
    where: { tripId },
    orderBy: { order: 'asc' },
  });
  const nextOrder = existingLegs.length;

  // Map: journeyId → legId (for journeyIds that already have a leg via event.legId)
  const journeyToLeg = new Map<string, string>();
  for (const row of rows) {
    if (row.journeyId && row.legId) {
      journeyToLeg.set(row.journeyId, row.legId);
    }
  }

  // Group unassigned events by journeyId
  const unassigned = rows.filter((r) => !r.legId);
  const byJourney = new Map<string, typeof unassigned>();
  const noJourney: typeof unassigned = [];

  for (const row of unassigned) {
    if (row.journeyId) {
      const g = byJourney.get(row.journeyId) ?? [];
      g.push(row);
      byJourney.set(row.journeyId, g);
    } else {
      noJourney.push(row);
    }
  }

  let orderCounter = nextOrder;

  // Create one leg per unassigned journeyId group
  for (const [journeyId, groupRows] of byJourney) {
    // Check if any event in this journeyId already has a leg (from a prior run)
    if (journeyToLeg.has(journeyId)) continue;

    const events = groupRows.map((r) => r.data as unknown as TimelineEvent);
    const name = generateLegName(events);
    const leg = await prisma.transportLeg.create({
      data: { tripId, name, nameIsCustom: false, order: orderCounter++ },
    });
    // Assign all events in this journey to the new leg
    await prisma.timelineEvent.updateMany({
      where: { tripId, journeyId },
      data: { legId: leg.id },
    });
  }

  // Create individual legs for events with no journeyId
  for (const row of noJourney) {
    const event = row.data as unknown as TimelineEvent;
    const name = generateLegName([event]);
    const leg = await prisma.transportLeg.create({
      data: { tripId, name, nameIsCustom: false, order: orderCounter++ },
    });
    await prisma.timelineEvent.updateMany({
      where: { id: row.id },
      data: { legId: leg.id },
    });
  }
}

// ─── Split & Merge ────────────────────────────────────────────────────────────

/**
 * Split a leg into two at atEventId.
 * Events before atEventId stay in the original leg; atEventId and later go to a new leg.
 * Returns [updatedOriginal, newLeg].
 */
export async function splitLeg(
  tripId: string,
  legId: string,
  atEventId: string,
): Promise<[LegRow, LegRow]> {
  // Load all events for this leg, sorted chronologically
  const rows = await prisma.timelineEvent.findMany({
    where: { tripId, legId, eventType: { in: ['flight', 'otherTransportation'] } },
    orderBy: [{ sortUtc: 'asc' }, { eventDate: 'asc' }],
    select: { id: true, data: true },
  });

  // Match by the event's own id (stored in the data JSON), since the DB pk
  // may differ from event.id for rows created before the id-alignment fix.
  const splitIdx = rows.findIndex((r) => (r.data as { id?: string }).id === atEventId || r.id === atEventId);
  if (splitIdx <= 0) {
    throw new Error('Cannot split: event not found or is the first event in this leg');
  }

  const originalLeg = await getLeg(legId);
  if (!originalLeg) throw new Error('Leg not found');

  const afterEvents = rows.slice(splitIdx);
  const afterEventData = afterEvents.map((r) => r.data as unknown as TimelineEvent);

  // Insert new leg immediately after the original
  await shiftLegsUp(tripId, originalLeg.order + 1);
  const newLeg = await prisma.transportLeg.create({
    data: {
      tripId,
      name: generateLegName(afterEventData),
      nameIsCustom: false,
      order: originalLeg.order + 1,
    },
  }) as unknown as LegRow;

  // Move split events to new leg
  await prisma.timelineEvent.updateMany({
    where: { id: { in: afterEvents.map((r) => r.id) } },
    data: { legId: newLeg.id },
  });

  // Regenerate original leg name if not custom
  const beforeEvents = rows.slice(0, splitIdx).map((r) => r.data as unknown as TimelineEvent);
  if (!originalLeg.nameIsCustom) {
    await prisma.transportLeg.update({
      where: { id: legId },
      data: { name: generateLegName(beforeEvents) },
    });
  }
  const updatedOriginal = await getLeg(legId) as LegRow;

  return [updatedOriginal, newLeg];
}

/**
 * Merge secondaryLegId into primaryLegId.
 * All events from secondary move to primary; secondary is deleted.
 * Returns the updated primary leg.
 */
export async function mergeLegs(
  tripId: string,
  primaryLegId: string,
  secondaryLegId: string,
): Promise<LegRow> {
  const [primary, secondary] = await Promise.all([
    getLeg(primaryLegId),
    getLeg(secondaryLegId),
  ]);
  if (!primary || !secondary) throw new Error('Leg not found');

  // Move events
  await prisma.timelineEvent.updateMany({
    where: { tripId, legId: secondaryLegId },
    data: { legId: primaryLegId },
  });

  // Delete secondary
  await prisma.transportLeg.delete({ where: { id: secondaryLegId } });
  await renumberLegs(tripId);

  // Regenerate primary name if not custom
  if (!primary.nameIsCustom) {
    const rows = await prisma.timelineEvent.findMany({
      where: { tripId, legId: primaryLegId, eventType: { in: ['flight', 'otherTransportation'] } },
      orderBy: [{ sortUtc: 'asc' }, { eventDate: 'asc' }],
      select: { data: true },
    });
    const events = rows.map((r) => r.data as unknown as TimelineEvent);
    await prisma.transportLeg.update({
      where: { id: primaryLegId },
      data: { name: generateLegName(events) },
    });
  }

  return getLeg(primaryLegId) as Promise<LegRow>;
}

// ─── Leg + events loader (for Transportation page) ───────────────────────────

export interface LegWithEvents {
  id: string;
  tripId: string;
  name: string | null;
  nameIsCustom: boolean;
  order: number;
  createdAt: string;
  events: TimelineEvent[];
}

export async function listLegsWithEvents(
  tripId: string,
): Promise<{ legs: LegWithEvents[]; unassigned: TimelineEvent[] }> {
  const [legRows, eventRows] = await Promise.all([
    prisma.transportLeg.findMany({
      where: { tripId },
      orderBy: { order: 'asc' },
    }),
    prisma.timelineEvent.findMany({
      where: {
        tripId,
        eventType: { in: ['flight', 'otherTransportation'] },
      },
      orderBy: [{ sortUtc: 'asc' }, { eventDate: 'asc' }],
      select: { id: true, legId: true, data: true },
    }),
  ]);

  const eventsByLeg = new Map<string, TimelineEvent[]>();
  const unassigned: TimelineEvent[] = [];

  for (const row of eventRows) {
    const event = row.data as unknown as TimelineEvent;
    if (row.legId) {
      const arr = eventsByLeg.get(row.legId) ?? [];
      arr.push(event);
      eventsByLeg.set(row.legId, arr);
    } else {
      unassigned.push(event);
    }
  }

  const legs: LegWithEvents[] = (legRows as unknown as LegRow[]).map((leg) => ({
    id: leg.id,
    tripId: leg.tripId,
    name: leg.name,
    nameIsCustom: leg.nameIsCustom,
    order: leg.order,
    createdAt: leg.createdAt.toISOString(),
    events: eventsByLeg.get(leg.id) ?? [],
  }));

  return { legs, unassigned };
}
