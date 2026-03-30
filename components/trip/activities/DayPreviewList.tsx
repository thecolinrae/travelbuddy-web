import { fmt12, type DayItem } from '@/components/trip/day/utils';

interface DayPreviewListProps {
  items: DayItem[];
}

function itemLabel(item: DayItem): { time: string | undefined; name: string } {
  if (item.kind === 'now') return { time: undefined, name: 'Now' };
  if (item.kind === 'activity') {
    return { time: item.activity.scheduledTime, name: item.activity.name };
  }
  const e = item.event;
  const name =
    e.type === 'flight'
      ? e.subtype === 'departure'
        ? `Flight ${e.flightNo} departs`
        : e.subtype === 'arrival'
        ? `Flight ${e.flightNo} arrives`
        : `Layover`
      : e.type === 'hotel'
      ? e.subtype === 'check_in'
        ? `Check in — ${e.hotelName}`
        : `Check out — ${e.hotelName}`
      : e.type === 'otherTransportation'
      ? `${e.subtype === 'departure' ? e.departureLocation + ' → ' + e.arrivalLocation : 'Arriving ' + e.arrivalLocation}`
      : e.type === 'activity'
      ? e.description
      : 'Event';
  return { time: e.time, name };
}

export function DayPreviewList({ items }: DayPreviewListProps) {
  const visible = items.filter((i) => i.kind !== 'now');

  if (visible.length === 0) {
    return (
      <p className="type-caption text-text-muted py-2">Nothing else scheduled yet.</p>
    );
  }

  return (
    <ul className="space-y-1.5">
      {visible.map((item, i) => {
        const { time, name } = itemLabel(item);
        const key = item.kind === 'activity' ? item.activity.id : item.kind === 'timeline' ? item.event.id : i;
        return (
          <li key={key} className="flex items-baseline gap-2">
            {time && (
              <span className="text-xs tabular-nums text-text-muted shrink-0 w-16">
                {fmt12(time)}
              </span>
            )}
            <span className="text-sm text-text-base leading-relaxed truncate">{name}</span>
          </li>
        );
      })}
    </ul>
  );
}
