import type { ActivityType } from '@/types';

const VALID_TYPES: ActivityType[] = [
  'sightseeing', 'food', 'adventure', 'culture',
  'shopping', 'nightlife', 'nature', 'wellness',
];

export function toActivityType(raw?: string): ActivityType {
  if (raw && VALID_TYPES.includes(raw as ActivityType)) return raw as ActivityType;
  return 'sightseeing';
}
