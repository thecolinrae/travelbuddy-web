import {
  Landmark, Utensils, Mountain, Theater, ShoppingBag, Moon, Trees, HeartPulse,
  Circle,
} from 'lucide-react';
import type { ActivityType } from '@/types';

export const CATEGORY_ICONS: Record<ActivityType, React.ComponentType<{ className?: string }>> = {
  sightseeing: Landmark,
  food:        Utensils,
  adventure:   Mountain,
  culture:     Theater,
  shopping:    ShoppingBag,
  nightlife:   Moon,
  nature:      Trees,
  wellness:    HeartPulse,
};

export const ICON_CLASS = 'h-4 w-4 text-green-700 dark:text-green-400';

export function CategoryIcon({ type }: { type: string }) {
  const Icon = CATEGORY_ICONS[type as ActivityType] ?? Circle;
  return <Icon className={ICON_CLASS} />;
}
