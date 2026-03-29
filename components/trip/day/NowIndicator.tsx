import { fmt12 } from './utils';

interface NowIndicatorProps {
  time: string; // HH:MM 24h
}

export function NowIndicator({ time }: NowIndicatorProps) {
  return (
    <div className="relative flex items-center my-2">
      <div className="flex-1 h-px bg-primary" />
      <span className="absolute left-0 -top-2.5 text-xs font-medium bg-card border border-primary text-text-base rounded-full px-2 py-0.5 whitespace-nowrap">
        Now · {fmt12(time)}
      </span>
    </div>
  );
}
