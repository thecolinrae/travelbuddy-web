/**
 * Anthropic Message Batches service for async activity generation.
 *
 * submitActivityBatch() — submits one request per destination to the Batches API,
 *   stores a BatchJob in the DB, and creates an "activities_generating" notification.
 *
 * processBatchResults() — polls a single BatchJob; if the Anthropic batch has ended,
 *   merges activities into the trip and flips the notification to "activities_ready".
 *   Safe to call concurrently (idempotent: completed/failed jobs are no-ops).
 */

import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '@/lib/prisma';
import { loadActivities, saveActivities } from './db';
import { filterOpenPlaces } from './places';
import type { Activity } from '@/types';

const client = new Anthropic(); // reads ANTHROPIC_API_KEY

const MODEL = 'claude-sonnet-4-6';

// Same prompt as suggestActivities() in claude.ts
const ACTIVITIES_SYSTEM = `You are a knowledgeable travel guide. When given a location and travel dates, suggest 12 diverse, interesting things to do there.

The location may be a neighbourhood, district, or full city name. Structure your suggestions in three geographic layers:
1. NEARBY (4–5 suggestions): Activities in or immediately around the given neighbourhood / district — places reachable on foot or within a short walk from a hotel there.
2. CITY (4–5 suggestions): Activities across the broader city that are worth a short trip (metro, bus, or taxi).
3. REGION (2–3 suggestions): Day-trip or half-day highlights in the wider metro area or surrounding region (30–90 min travel).

If the location is already a major city rather than a sub-district, skip layer 1 and distribute between city highlights and notable neighbourhoods to visit.

Return ONLY a JSON array with this schema:
[
  {
    "id": "unique-slug",
    "name": "Activity Name",
    "description": "2-3 sentence description of the activity and why it's worth doing",
    "type": "sightseeing|food|adventure|culture|shopping|nightlife|nature|wellness",
    "estimatedCost": "$10-20 per person",
    "duration": "2-3 hours",
    "bestTime": "Morning|Evening|Anytime",
    "tips": "One practical tip for visitors",
    "address": "Specific neighbourhood or area (not a full street address)",
    "rating": 4.5,
    "saved": false
  }
]

Vary the types. Include at least 2 food options, 2 culture/sightseeing, 1 nature, and mix others.
Return only the JSON array, no commentary.`;

function parseActivities(raw: string): Activity[] {
  const jsonMatch = raw.match(/```json\n?([\s\S]*?)```/) ?? raw.match(/(\[[\s\S]*\])/);
  const jsonText = jsonMatch ? (jsonMatch[1] ?? jsonMatch[0]) : raw;
  return JSON.parse(jsonText.trim()) as Activity[];
}

export async function submitActivityBatch(
  tripId: string,
  userId: string,
  destinations: string[],
  startDate: string,
  endDate: string,
): Promise<void> {
  const requests = destinations.map((dest) => ({
    custom_id: dest,
    params: {
      model: MODEL as 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: ACTIVITIES_SYSTEM,
      messages: [
        {
          role: 'user' as const,
          content: `Suggest things to do in and around "${dest}" for a trip from ${startDate} to ${endDate}. Remember to include activities close to ${dest} itself, across the broader city, and in the surrounding region.`,
        },
      ],
    },
  }));

  const batch = await client.messages.batches.create({ requests });

  const job = await prisma.batchJob.create({
    data: {
      userId,
      tripId,
      anthropicBatchId: batch.id,
      status: 'pending',
      destinations,
    },
  });

  await prisma.notification.create({
    data: {
      userId,
      tripId,
      batchJobId: job.id,
      type: 'activities_generating',
    },
  });
}

export async function processBatchResults(jobId: string): Promise<void> {
  const job = await prisma.batchJob.findUnique({ where: { id: jobId } });
  if (!job || job.status === 'completed' || job.status === 'failed') return;

  const batch = await client.messages.batches.retrieve(job.anthropicBatchId);

  if (batch.processing_status === 'in_progress') {
    // Mark processing so future polls know it's been seen
    if (job.status === 'pending') {
      await prisma.batchJob.update({ where: { id: jobId }, data: { status: 'processing' } });
    }
    return;
  }

  if (batch.processing_status !== 'ended') return;

  // Collect results
  const allNew: Activity[] = [];
  for await (const result of await client.messages.batches.results(job.anthropicBatchId)) {
    if (result.result.type !== 'succeeded') continue;
    const dest = result.custom_id;
    const text = result.result.message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    try {
      const activities = parseActivities(text);
      const verified = await filterOpenPlaces(activities, dest);
      allNew.push(...verified.map((a) => ({ ...a, city: dest, saved: true as const })));
    } catch {
      // skip this destination — non-fatal
    }
  }

  // Merge with existing, deduping by id
  const existing = await loadActivities(job.tripId);
  const existingIds = new Set((existing?.savedActivities ?? []).map((a) => a.id));
  const deduped = allNew.filter((a) => !existingIds.has(a.id));

  await saveActivities(job.tripId, job.destinations[0] ?? '', [
    ...(existing?.savedActivities ?? []),
    ...deduped,
  ]);

  await prisma.batchJob.update({ where: { id: jobId }, data: { status: 'completed' } });

  await prisma.notification.updateMany({
    where: { batchJobId: jobId, type: 'activities_generating' },
    data: { type: 'activities_ready' },
  });
}
