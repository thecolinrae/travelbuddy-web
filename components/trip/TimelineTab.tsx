'use client';

import type { TimelineEvent } from '@/types';

function eventIcon(e: TimelineEvent): string {
  if (e.type === 'flight') return e.subtype === 'departure' ? '✈️' : '🛬';
  if (e.type === 'hotel') return e.subtype === 'check_in' ? '🏨' : '🔑';
  if (e.type === 'otherTransportation') return e.subtype === 'departure' ? '🚌' : '📍';
  if (e.type === 'expense') return '💰';
  if (e.type === 'activity') return '🎭';
  return '📌';
}

function eventHeadline(e: TimelineEvent): string {
  if (e.type === 'flight' && e.subtype === 'departure')
    return `${e.flightNo} · ${e.departureAirport} → ${e.arrivalAirport}`;
  if (e.type === 'flight' && e.subtype === 'arrival')
    return `Arrive ${e.arrivalAirport} on ${e.flightNo}`;
  if (e.type === 'hotel' && e.subtype === 'check_in')
    return `Check in — ${e.hotelName}`;
  if (e.type === 'hotel' && e.subtype === 'check_out')
    return `Check out — ${e.hotelName}`;
  if (e.type === 'otherTransportation')
    return `${e.departureLocation} → ${e.arrivalLocation}`;
  if (e.type === 'expense') return e.description;
  if (e.type === 'activity') return e.description;
  return e.locationCity;
}

function fmt12(time?: string): string {
  if (!time) return '';
  const [hStr, mStr] = time.split(':');
  const h = parseInt(hStr, 10);
  const m = mStr ?? '00';
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${suffix}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

interface Props {
  timeline: TimelineEvent[];
}

export function TimelineTab({ timeline }: Props) {
  if (timeline.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground text-sm">
        No events in the timeline yet.
      </div>
    );
  }

  // Group by date
  const byDate = new Map<string, TimelineEvent[]>();
  for (const e of timeline) {
    const day = e.date;
    if (!byDate.has(day)) byDate.set(day, []);
    byDate.get(day)!.push(e);
  }

  const days = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="space-y-8">
      {days.map(([date, events]) => (
        <div key={date}>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            {formatDate(date)}
          </h3>
          <ul className="space-y-2">
            {events.map((e) => (
              <li key={e.id} className="flex items-start gap-3 rounded-lg border bg-card px-4 py-3">
                <span className="text-lg leading-none mt-0.5 shrink-0">{eventIcon(e)}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{eventHeadline(e)}</p>
                  <div className="flex flex-wrap gap-x-3 mt-0.5">
                    {e.time && (
                      <span className="text-xs text-muted-foreground">{fmt12(e.time)}</span>
                    )}
                    {e.locationCity && (
                      <span className="text-xs text-muted-foreground">📍 {e.locationCity}</span>
                    )}
                    {e.type === 'expense' && (
                      <span className="text-xs text-muted-foreground">
                        {new Intl.NumberFormat('en-US', {
                          style: 'currency',
                          currency: e.cost.preferredCurrency,
                        }).format(e.cost.amountPreferredCurrency)}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
