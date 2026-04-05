/**
 * Activity ↔ ActivityEvent similarity matching.
 *
 * Pure functions with zero external dependencies — safe to import in both
 * server routes (parse/route.ts) and client components (DayTab).
 */

import type { Activity, ActivityEvent } from '@/types';

export interface MatchCandidate {
  activity: Activity;
  event: ActivityEvent;
  /** Jaccard similarity + optional substring bonus. Range 0–1. */
  score: number;
  /** true when score >= AUTO_MERGE_THRESHOLD — safe to link without user confirmation */
  autoMerge: boolean;
}

const SUGGEST_THRESHOLD    = 0.35;
const AUTO_MERGE_THRESHOLD = 0.60;

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'at', 'in', 'of', 'and', 'to', 'for', 'by', 'on',
  // French/Spanish common words (destinations are global)
  'le', 'la', 'les', 'de', 'du', 'des', 'el', 'los', 'las',
]);

/** Normalize a string to a set of meaningful tokens. */
export function tokenize(s: string): Set<string> {
  return new Set(
    s.toLowerCase()
      .replace(/[''`]/g, '')           // collapse apostrophes
      .replace(/[^a-z0-9\s]/g, ' ')   // strip non-alphanumeric
      .split(/\s+/)
      .filter((t) => t.length > 1 && !STOP_WORDS.has(t)),
  );
}

/** Jaccard similarity: |intersection| / |union|. */
export function jaccardScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) {
    if (b.has(t)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Score a single (Activity, ActivityEvent) pair.
 * Returns null when dates don't match (fast-fail, avoids token work).
 * Adds a +0.15 substring bonus when one name is contained in the other,
 * catching cases like "Louvre" ↔ "Visit the Louvre Museum".
 */
export function scorePair(activity: Activity, event: ActivityEvent): number | null {
  if (!activity.scheduledDate || activity.scheduledDate !== event.date) return null;

  const aToks = tokenize(activity.name);
  const eToks = tokenize(event.description);
  let score = jaccardScore(aToks, eToks);

  // Substring bonus
  const aNorm = activity.name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const eNorm = event.description.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (aNorm.length > 2 && eNorm.length > 2) {
    if (aNorm.includes(eNorm) || eNorm.includes(aNorm)) {
      score = Math.min(1, score + 0.15);
    }
  }

  return score;
}

/**
 * Find all (Activity, ActivityEvent) pairs above SUGGEST_THRESHOLD.
 * Skips items that already have a link set.
 * Returns candidates sorted descending by score.
 */
export function findMergeCandidates(
  activities: Activity[],
  events: ActivityEvent[],
): MatchCandidate[] {
  const candidates: MatchCandidate[] = [];

  for (const activity of activities) {
    if (activity.linkedEventId) continue;
    for (const event of events) {
      if (event.linkedActivityId) continue;
      const score = scorePair(activity, event);
      if (score === null || score < SUGGEST_THRESHOLD) continue;
      candidates.push({ activity, event, score, autoMerge: score >= AUTO_MERGE_THRESHOLD });
    }
  }

  return candidates.sort((a, b) => b.score - a.score);
}
