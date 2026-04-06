/**
 * Migrate timeline expense events that have an incorrect preferredCurrency.
 *
 * This fixes data created when the codebase had a hardcoded 'USD' fallback.
 * For each expense event where cost.preferredCurrency doesn't match the trip's
 * preferredCurrency, we:
 *   1. If the event has local currency data (amountLocalCurrency + localCurrency),
 *      recalculate amountPreferredCurrency from those fields using live rates.
 *   2. Otherwise, convert amountPreferredCurrency from the stored (wrong) currency
 *      to the trip's actual preferredCurrency using live rates.
 *
 * Run: DATABASE_URL=<url> npx tsx scripts/backfill-currency.ts
 *
 * Idempotent — safe to run multiple times. Skips events that are already correct.
 * Pass --dry-run to preview changes without writing.
 */

import { PrismaClient } from '@prisma/client';
import { fetchRatesFromPreferred } from '../services/currency';
import { makeCost } from '../services/timeline';
import type { TimelineEvent, ExpenseEvent, Cost } from '../types';

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');

// Cache rates per preferred currency to avoid redundant API calls
const rateCache = new Map<string, Record<string, number>>();

async function getRates(preferredCurrency: string): Promise<Record<string, number>> {
  if (rateCache.has(preferredCurrency)) return rateCache.get(preferredCurrency)!;
  const result = await fetchRatesFromPreferred(preferredCurrency);
  console.log(`  Rates for ${preferredCurrency}: ${result.isLive ? 'live' : 'estimated (fallback)'}`);
  rateCache.set(preferredCurrency, result.rates);
  return result.rates;
}

async function main() {
  console.log(dryRun ? '--- DRY RUN (no writes) ---\n' : '--- LIVE RUN ---\n');

  const trips = await prisma.trip.findMany({
    select: { id: true, name: true, preferredCurrency: true },
  });
  console.log(`Processing ${trips.length} trips...\n`);

  let totalFixed = 0;
  let totalSkipped = 0;

  for (const trip of trips) {
    const rows = await prisma.timelineEvent.findMany({
      where: { tripId: trip.id, eventType: 'expense' },
      select: { id: true, data: true },
    });

    if (rows.length === 0) continue;

    const toUpdate: Array<{ id: string; data: unknown }> = [];

    for (const row of rows) {
      const event = row.data as unknown as ExpenseEvent;
      const cost = event.cost as Cost;

      // Already correct
      if (cost.preferredCurrency === trip.preferredCurrency) {
        totalSkipped++;
        continue;
      }

      const wrongCurrency = cost.preferredCurrency;
      const targetCurrency = trip.preferredCurrency;

      let newCost: Cost;

      if (cost.amountLocalCurrency !== undefined && cost.localCurrency) {
        // Has local currency data — recalculate preferred amount from local amount
        const rates = await getRates(targetCurrency);
        newCost = makeCost(cost.amountLocalCurrency, cost.localCurrency, targetCurrency, rates);
      } else {
        // No local currency data — convert the stored (wrong-currency) amount to target currency
        const rates = await getRates(targetCurrency);
        // rates: 1 targetCurrency = rates[wrongCurrency] wrongCurrency
        // → amountInTarget = amountInWrong / rates[wrongCurrency]
        const rate = rates[wrongCurrency] ?? 1;
        const converted = Math.round((cost.amountPreferredCurrency / rate) * 100) / 100;
        newCost = {
          amountPreferredCurrency: converted,
          preferredCurrency: targetCurrency,
        };
      }

      const updatedEvent: ExpenseEvent = { ...event, cost: newCost };

      console.log(
        `  [${trip.name}] "${event.description}" — ` +
        `${cost.amountPreferredCurrency} ${wrongCurrency} → ${newCost.amountPreferredCurrency} ${targetCurrency}`,
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      toUpdate.push({ id: row.id, data: updatedEvent as any });
      totalFixed++;
    }

    if (toUpdate.length > 0 && !dryRun) {
      await Promise.all(
        toUpdate.map((u) =>
          prisma.timelineEvent.update({
            where: { id: u.id },
            // Prisma Json field — cast required
            data: { data: JSON.parse(JSON.stringify(u.data)) },
          }),
        ),
      );
    }
  }

  console.log(`\nDone. Fixed: ${totalFixed}, already correct: ${totalSkipped}.`);
  if (dryRun) console.log('(No writes performed — remove --dry-run to apply changes.)');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
