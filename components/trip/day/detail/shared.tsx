import { fmt12, fmtUtc, tzAbbr } from '@/components/trip/day/utils';
import type { TransportType } from '@/types';
import { Bus, Train, Ship, Car, Navigation } from 'lucide-react';

export { fmt12, fmtUtc, tzAbbr };

export const TRANSPORT_ICONS: Record<TransportType, React.ComponentType<{ className?: string }>> = {
  bus: Bus, train: Train, ferry: Ship,
  car_rental: Car, taxi: Car, rideshare: Car, drive: Car, other: Navigation,
};

export const TRANSPORT_LABELS: Record<TransportType, string> = {
  bus: 'Bus', train: 'Train', ferry: 'Ferry',
  car_rental: 'Car rental', taxi: 'Taxi', rideshare: 'Rideshare', drive: 'Drive', other: 'Transport',
};

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-medium text-text-muted uppercase tracking-wide">{children}</p>
  );
}

export function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-3 flex items-start gap-2">
      <span className="mt-0.5 shrink-0 text-text-muted">{icon}</span>
      <div>
        <p className="text-xs text-text-muted">{label}</p>
        <p className="text-sm text-text-base leading-snug">{value}</p>
      </div>
    </div>
  );
}

export function formatLayover(minutes?: number): string {
  if (!minutes) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function formatShortDate(date: string): string {
  return new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
