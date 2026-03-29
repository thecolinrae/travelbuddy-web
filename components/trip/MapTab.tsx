'use client';

import type { TimelineEvent } from '@/types';

interface Props {
  timeline: TimelineEvent[];
}

export function MapTab({ timeline }: Props) {
  // Collect unique locations from hotel and activity events
  const locations: Array<{ label: string; city: string; address?: string }> = [];
  for (const e of timeline) {
    if (e.type === 'hotel' && e.subtype === 'check_in') {
      locations.push({ label: `🏨 ${e.hotelName}`, city: e.locationCity, address: e.locationAddress });
    } else if (e.type === 'activity') {
      locations.push({ label: `🎭 ${e.description}`, city: e.locationCity, address: e.locationAddress });
    }
  }

  const unique = locations.filter(
    (loc, i, arr) => arr.findIndex((l) => l.label === loc.label) === i,
  );

  return (
    <div className="space-y-4">
      <div className="rounded-xl border-2 border-dashed border-muted-foreground/20 bg-muted/20 flex items-center justify-center h-48 text-muted-foreground">
        <p className="text-sm">Interactive map coming in a future update</p>
      </div>

      {unique.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Locations
          </h3>
          <ul className="space-y-1.5">
            {unique.map((loc, i) => (
              <li key={i} className="rounded-lg border bg-card px-4 py-2.5">
                <p className="text-sm font-medium">{loc.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {loc.address ? `${loc.address}, ` : ''}{loc.city}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
