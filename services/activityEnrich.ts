import { enrichActivity } from '@/services/claude';
import type { Activity } from '@/types';

/** Enriches an activity in-place if it has no address yet. Non-fatal — returns the original on error. */
export async function enrichIfMissingAddress(activity: Activity): Promise<Activity> {
  if (activity.address) return activity;
  try {
    const enriched = await enrichActivity(activity.name, activity.city ?? '');
    return {
      ...activity,
      description: activity.description || enriched.description || activity.description,
      type: activity.type || enriched.type || activity.type,
      estimatedCost: activity.estimatedCost ?? enriched.estimatedCost,
      duration: activity.duration ?? enriched.duration,
      bestTime: activity.bestTime ?? enriched.bestTime,
      tips: activity.tips ?? enriched.tips,
      familyFriendly: activity.familyFriendly ?? enriched.familyFriendly,
      highlights: activity.highlights ?? enriched.highlights,
      address: enriched.locationAddress,
      city: activity.city || enriched.city || activity.city,
    };
  } catch {
    return activity;
  }
}
