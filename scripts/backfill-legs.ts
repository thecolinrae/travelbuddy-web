/**
 * Backfill transport legs for existing trips.
 *
 * Run: DATABASE_URL=<url> npx tsx scripts/backfill-legs.ts
 *
 * Idempotent — safe to run multiple times.
 */

import { PrismaClient } from '@prisma/client';
import { generateLegName } from '../services/legs';
import type { TimelineEvent } from '../types';

const prisma = new PrismaClient();

async function main() {
  const trips = await prisma.trip.findMany({ select: { id: true, name: true } });
  console.log(`Processing ${trips.length} trips...`);

  let totalLegs = 0;
  let totalEvents = 0;

  for (const trip of trips) {
    const rows = await prisma.timelineEvent.findMany({
      where: {
        tripId: trip.id,
        eventType: { in: ['flight', 'otherTransportation'] },
        legId: null, // only unassigned events
      },
      orderBy: [{ sortUtc: 'asc' }, { eventDate: 'asc' }],
      select: { id: true, journeyId: true, data: true },
    });

    if (rows.length === 0) continue;

    const existingLegs = await prisma.transportLeg.findMany({
      where: { tripId: trip.id },
      orderBy: { order: 'asc' },
    });
    let orderCounter = existingLegs.length;

    // Group by journeyId
    const byJourney = new Map<string, typeof rows>();
    const noJourney: typeof rows = [];

    for (const row of rows) {
      if (row.journeyId) {
        const g = byJourney.get(row.journeyId) ?? [];
        g.push(row);
        byJourney.set(row.journeyId, g);
      } else {
        noJourney.push(row);
      }
    }

    let tripLegs = 0;
    let tripEvents = 0;

    for (const [, groupRows] of byJourney) {
      const events = groupRows.map((r) => r.data as unknown as TimelineEvent);
      const name = generateLegName(events);
      const leg = await prisma.transportLeg.create({
        data: { tripId: trip.id, name, nameIsCustom: false, order: orderCounter++ },
      });
      await prisma.timelineEvent.updateMany({
        where: { id: { in: groupRows.map((r) => r.id) } },
        data: { legId: leg.id },
      });
      tripLegs++;
      tripEvents += groupRows.length;
    }

    for (const row of noJourney) {
      const event = row.data as unknown as TimelineEvent;
      const name = generateLegName([event]);
      const leg = await prisma.transportLeg.create({
        data: { tripId: trip.id, name, nameIsCustom: false, order: orderCounter++ },
      });
      await prisma.timelineEvent.update({
        where: { id: row.id },
        data: { legId: leg.id },
      });
      tripLegs++;
      tripEvents++;
    }

    if (tripLegs > 0) {
      console.log(`  ${trip.name}: created ${tripLegs} legs, assigned ${tripEvents} events`);
    }
    totalLegs += tripLegs;
    totalEvents += tripEvents;
  }

  console.log(`\nDone. Created ${totalLegs} legs, assigned ${totalEvents} events across ${trips.length} trips.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
