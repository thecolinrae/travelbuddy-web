import {
  PlaneTakeoff, PlaneLanding, BedDouble, LogOut, Compass,
  Receipt, Car, Circle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type EventType =
  | 'flight' | 'departure'
  | 'arrival'
  | 'hotel' | 'check_in'
  | 'check_out'
  | 'activity'
  | 'expense'
  | 'transport' | 'otherTransportation'
  | 'other';

interface TripIconProps {
  type: EventType | string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_MAP = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-8 w-8',
} as const;

const TYPE_MAP: Record<string, { Icon: React.ComponentType<{ className?: string }>; colorClass: string }> = {
  flight:              { Icon: PlaneTakeoff, colorClass: 'text-secondary' },
  departure:           { Icon: PlaneTakeoff, colorClass: 'text-secondary' },
  arrival:             { Icon: PlaneLanding, colorClass: 'text-secondary' },
  hotel:               { Icon: BedDouble,    colorClass: 'text-accent' },
  check_in:            { Icon: BedDouble,    colorClass: 'text-accent' },
  check_out:           { Icon: LogOut,       colorClass: 'text-accent' },
  activity:            { Icon: Compass,      colorClass: 'text-green-700 dark:text-green-400' },
  expense:             { Icon: Receipt,      colorClass: 'text-warning' },
  transport:           { Icon: Car,          colorClass: 'text-secondary' },
  otherTransportation: { Icon: Car,          colorClass: 'text-secondary' },
};

export function TripIcon({ type, className, size = 'sm' }: TripIconProps) {
  const entry = TYPE_MAP[type] ?? { Icon: Circle, colorClass: 'text-text-muted' };
  const { Icon, colorClass } = entry;
  return <Icon className={cn(SIZE_MAP[size], colorClass, className)} />;
}
