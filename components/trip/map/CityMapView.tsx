'use client';

import { useMemo, useState } from 'react';
import {
  MapPin,
  BedDouble,
  Binoculars,
  UtensilsCrossed,
  Mountain,
  Landmark,
  ShoppingBag,
  Music,
  TreePine,
  Heart,
  PlaneLanding,
  TrainFront,
  Bus,
  Ship,
  Car,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { CityMapCanvas, type MapMarker } from './CityMapCanvas';
import type {
  TimelineEvent,
  Activity,
  ActivityType,
  TransportType,
  HotelCheckInEvent,
  FlightArrivalEvent,
  TransportArrivalEvent,
  ActivityEvent,
} from '@/types';

interface Props {
  trip: { destinations: string[]; status: string };
  timeline: TimelineEvent[];
  activities: Activity[];
}

// ── Lucide icon SVG paths (extracted from lucide-react 24×24 viewBox) ──────────
// These are embedded in map markers as SVG data URIs — no runtime React rendering needed.

const ICON_SVG = {
  hotel:
    '<path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8"/>' +
    '<path d="M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4"/>' +
    '<path d="M12 4v6"/><path d="M2 18h20"/>',
  sightseeing:
    '<path d="M10 10h4"/>' +
    '<path d="M19 7V4a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v3"/>' +
    '<path d="M20 21a2 2 0 0 0 2-2v-3.851c0-1.39-2-2.962-2-4.829V8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v11a2 2 0 0 0 2 2z"/>' +
    '<path d="M22 16L2 16"/>' +
    '<path d="M4 21a2 2 0 0 1-2-2v-3.851c0-1.39 2-2.962 2-4.829V8a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v11a2 2 0 0 1-2 2z"/>' +
    '<path d="M9 7V4a1 1 0 0 0-1-1H6a1 1 0 0 0-1 1v3"/>',
  food:
    '<path d="m16 2-2.3 2.3a3 3 0 0 0 0 4.2l1.8 1.8a3 3 0 0 0 4.2 0L22 8"/>' +
    '<path d="M15 15 3.3 3.3a4.2 4.2 0 0 0 0 6l7.3 7.3c.7.7 2 .7 2.8 0L15 15Zm0 0 7 7"/>' +
    '<path d="m2.1 21.8 6.4-6.3"/><path d="m19 5-7 7"/>',
  adventure:
    '<path d="m8 3 4 8 5-5 5 15H2L8 3z"/>',
  culture:
    '<line x1="3" x2="21" y1="22" y2="22"/>' +
    '<line x1="6" x2="6" y1="18" y2="11"/>' +
    '<line x1="10" x2="10" y1="18" y2="11"/>' +
    '<line x1="14" x2="14" y1="18" y2="11"/>' +
    '<line x1="18" x2="18" y1="18" y2="11"/>' +
    '<polygon points="12 2 20 7 4 7"/>',
  shopping:
    '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/>' +
    '<path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  nightlife:
    '<path d="M9 18V5l12-2v13"/>' +
    '<circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  nature:
    '<path d="m17 14 3 3.3a1 1 0 0 1-.7 1.7H4.7a1 1 0 0 1-.7-1.7L7 14h-.3a1 1 0 0 1-.7-1.7L9 9h-.2A1 1 0 0 1 8 7.3L12 3l4 4.3a1 1 0 0 1-.8 1.7H15l3 3.3a1 1 0 0 1-.7 1.7H17Z"/>' +
    '<path d="M12 22v-3"/>',
  wellness:
    '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  flight:
    '<path d="M2 22h20"/>' +
    '<path d="M3.77 10.77 2 9l2-4.5 1.1.55c.55.28.9.84.9 1.45s.35 1.17.9 1.45L8 8.5l3-6 1.05.53a2 2 0 0 1 1.09 1.52l.72 5.4a2 2 0 0 0 1.09 1.52l4.4 2.2c.42.22.78.55 1.01.96l.6 1.03c.49.88-.06 1.98-1.06 2.1l-1.18.15c-.47.06-.95-.02-1.37-.24L4.29 11.15a2 2 0 0 1-.52-.38Z"/>',
  train:
    '<path d="M8 3.1V7a4 4 0 0 0 8 0V3.1"/>' +
    '<path d="m9 15-1-1"/><path d="m15 15 1-1"/>' +
    '<path d="M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z"/>' +
    '<path d="m8 19-2 3"/><path d="m16 19 2 3"/>',
  bus:
    '<path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/>' +
    '<path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/>' +
    '<circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/>',
  ferry:
    '<path d="M12 10.189V14"/><path d="M12 2v3"/>' +
    '<path d="M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6"/>' +
    '<path d="M19.38 20A11.6 11.6 0 0 0 21 14l-8.188-3.639a2 2 0 0 0-1.624 0L3 14a11.6 11.6 0 0 0 2.81 7.76"/>' +
    '<path d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1s1.2 1 2.5 1c2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>',
  car:
    '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>' +
    '<circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
} as const;

// ── Colour palette ─────────────────────────────────────────────────────────────

const HOTEL_COLOR = '#e07b39';

const ACTIVITY_COLORS: Record<ActivityType, string> = {
  sightseeing: '#2d6a4f',
  food:        '#d97706',
  adventure:   '#dc2626',
  culture:     '#7c3aed',
  shopping:    '#db2777',
  nightlife:   '#4338ca',
  nature:      '#16a34a',
  wellness:    '#0891b2',
};

const TRANSPORT_COLORS: Record<TransportType | 'flight', string> = {
  flight:      '#1d4ed8',
  train:       '#0369a1',
  bus:         '#0369a1',
  ferry:       '#0e7490',
  car_rental:  '#1d4ed8',
  drive:       '#1d4ed8',
  taxi:        '#1d4ed8',
  rideshare:   '#1d4ed8',
  other:       '#1d4ed8',
};

// ── Legend metadata ────────────────────────────────────────────────────────────

interface LegendEntry {
  key: string;
  color: string;
  label: string;
  Icon: LucideIcon;
}

const ACTIVITY_LEGEND: Record<ActivityType, LegendEntry> = {
  sightseeing: { key: 'sightseeing', color: ACTIVITY_COLORS.sightseeing, label: 'Sightseeing', Icon: Binoculars },
  food:        { key: 'food',        color: ACTIVITY_COLORS.food,        label: 'Food & drink',  Icon: UtensilsCrossed },
  adventure:   { key: 'adventure',   color: ACTIVITY_COLORS.adventure,   label: 'Adventure',     Icon: Mountain },
  culture:     { key: 'culture',     color: ACTIVITY_COLORS.culture,     label: 'Culture',       Icon: Landmark },
  shopping:    { key: 'shopping',    color: ACTIVITY_COLORS.shopping,    label: 'Shopping',      Icon: ShoppingBag },
  nightlife:   { key: 'nightlife',   color: ACTIVITY_COLORS.nightlife,   label: 'Nightlife',     Icon: Music },
  nature:      { key: 'nature',      color: ACTIVITY_COLORS.nature,      label: 'Nature',        Icon: TreePine },
  wellness:    { key: 'wellness',    color: ACTIVITY_COLORS.wellness,    label: 'Wellness',      Icon: Heart },
};

const TRANSPORT_LEGEND: Record<TransportType | 'flight', LegendEntry> = {
  flight:     { key: 'flight',     color: TRANSPORT_COLORS.flight,     label: 'Airport',        Icon: PlaneLanding },
  train:      { key: 'train',      color: TRANSPORT_COLORS.train,      label: 'Train station',  Icon: TrainFront },
  bus:        { key: 'bus',        color: TRANSPORT_COLORS.bus,        label: 'Bus station',    Icon: Bus },
  ferry:      { key: 'ferry',      color: TRANSPORT_COLORS.ferry,      label: 'Ferry terminal', Icon: Ship },
  car_rental: { key: 'car_rental', color: TRANSPORT_COLORS.car_rental, label: 'Car rental',     Icon: Car },
  drive:      { key: 'drive',      color: TRANSPORT_COLORS.drive,      label: 'Drive',            Icon: Car },
  taxi:       { key: 'taxi',       color: TRANSPORT_COLORS.taxi,       label: 'Taxi / rideshare', Icon: Car },
  rideshare:  { key: 'rideshare',  color: TRANSPORT_COLORS.rideshare,  label: 'Taxi / rideshare', Icon: Car },
  other:      { key: 'other',      color: TRANSPORT_COLORS.other,      label: 'Transport',       Icon: Car },
};

// ── City derivation ────────────────────────────────────────────────────────────

function deriveCities(
  destinations: string[],
  timeline: TimelineEvent[],
): string[] {
  const cities: string[] = [...destinations];
  const seen = new Set(destinations.map((c) => c.toLowerCase()));

  const sorted = [...timeline].sort((a, b) => a.date.localeCompare(b.date));
  for (const ev of sorted) {
    const city = ev.locationCity;
    if (city && !seen.has(city.toLowerCase())) {
      seen.add(city.toLowerCase());
      cities.push(city);
    }
  }

  return cities;
}

// ── Marker builder ─────────────────────────────────────────────────────────────

function buildMarkersForCity(
  city: string,
  timeline: TimelineEvent[],
  activities: Activity[],
): MapMarker[] {
  const markers: MapMarker[] = [];
  const seen = new Set<string>();

  function add(m: MapMarker) {
    if (!seen.has(m.id)) {
      seen.add(m.id);
      markers.push(m);
    }
  }

  const cityLower = city.toLowerCase();

  // Hotels
  for (const ev of timeline) {
    if (
      ev.type === 'hotel' &&
      ev.subtype === 'check_in' &&
      ev.locationCity.toLowerCase() === cityLower
    ) {
      const h = ev as HotelCheckInEvent;
      add({
        id: `hotel-${h.id}`,
        label: h.hotelName,
        detail: h.locationAddress ?? h.locationCity,
        query: h.locationAddress
          ? `${h.hotelName}, ${h.locationAddress}`
          : `${h.hotelName}, ${h.locationCity}`,
        color: HOTEL_COLOR,
        legendLabel: 'Hotel',
        iconInnerSvg: ICON_SVG.hotel,
      });
    }
  }

  // Scheduled activity objects
  for (const a of activities) {
    if (
      a.scheduledDate !== undefined &&
      (a.city ?? '').toLowerCase() === cityLower
    ) {
      const pos =
        a.latitude != null && a.longitude != null
          ? { lat: a.latitude, lng: a.longitude }
          : undefined;
      const query = a.address
        ? `${a.address}, ${a.city ?? city}`
        : (a.city ?? city);
      add({
        id: `activity-${a.id}`,
        label: a.name,
        detail: a.address ?? a.city,
        query,
        position: pos,
        color: ACTIVITY_COLORS[a.type] ?? ACTIVITY_COLORS.sightseeing,
        legendLabel: ACTIVITY_LEGEND[a.type]?.label ?? 'Activity',
        iconInnerSvg: ICON_SVG[a.type] ?? ICON_SVG.sightseeing,
      });
    }
  }

  // Timeline activity events
  for (const ev of timeline) {
    if (ev.type === 'activity' && ev.locationCity.toLowerCase() === cityLower) {
      const ae = ev as ActivityEvent;
      const subtype = (ae.category as ActivityType) ?? 'sightseeing';
      const query = ae.locationAddress
        ? `${ae.locationAddress}, ${ae.locationCity}`
        : ae.locationCity;
      add({
        id: `activity-event-${ae.id}`,
        label: ae.description,
        detail: ae.locationAddress ?? ae.locationCity,
        query,
        color: ACTIVITY_COLORS[subtype] ?? ACTIVITY_COLORS.sightseeing,
        legendLabel: ACTIVITY_LEGEND[subtype]?.label ?? 'Activity',
        iconInnerSvg: ICON_SVG[subtype] ?? ICON_SVG.sightseeing,
      });
    }
  }

  // Flight arrivals
  for (const ev of timeline) {
    if (
      ev.type === 'flight' &&
      ev.subtype === 'arrival' &&
      ev.locationCity.toLowerCase() === cityLower
    ) {
      const fa = ev as FlightArrivalEvent;
      add({
        id: `flight-arrival-${fa.id}`,
        label: fa.arrivalAirport,
        detail: `Airport · Flight ${fa.flightNo}`,
        query: `${fa.arrivalAirport} airport`,
        color: TRANSPORT_COLORS.flight,
        legendLabel: 'Airport',
        iconInnerSvg: ICON_SVG.flight,
      });
    }
  }

  // Other transport arrivals
  for (const ev of timeline) {
    if (
      ev.type === 'otherTransportation' &&
      ev.subtype === 'arrival' &&
      ev.locationCity.toLowerCase() === cityLower
    ) {
      const ta = ev as TransportArrivalEvent;
      const legend = TRANSPORT_LEGEND[ta.transportType] ?? TRANSPORT_LEGEND.other;
      const transportIconKey = ta.transportType as keyof typeof ICON_SVG;
      add({
        id: `transport-arrival-${ta.id}`,
        label: ta.arrivalLocation,
        detail: `${legend.label} · ${ta.locationCity}`,
        query: `${ta.arrivalLocation}, ${ta.locationCity}`,
        color: TRANSPORT_COLORS[ta.transportType] ?? TRANSPORT_COLORS.other,
        legendLabel: legend.label,
        iconInnerSvg: ICON_SVG[transportIconKey] ?? ICON_SVG.car,
      });
    }
  }

  return markers;
}

// ── Legend component ───────────────────────────────────────────────────────────

function MapLegend({ markers }: { markers: MapMarker[] }) {
  // Collect unique legend entries present in the current marker set
  const entries: LegendEntry[] = [];
  const seen = new Set<string>();

  const hotelPresent = markers.some((m) => m.color === HOTEL_COLOR);
  if (hotelPresent && !seen.has('hotel')) {
    seen.add('hotel');
    entries.push({ key: 'hotel', color: HOTEL_COLOR, label: 'Hotel', Icon: BedDouble });
  }

  for (const m of markers) {
    if (seen.has(m.legendLabel)) continue;
    seen.add(m.legendLabel);

    // Find a matching legend entry from either activity or transport tables
    const activityEntry = Object.values(ACTIVITY_LEGEND).find(
      (e) => e.label === m.legendLabel,
    );
    const transportEntry = Object.values(TRANSPORT_LEGEND).find(
      (e) => e.label === m.legendLabel,
    );
    const entry = activityEntry ?? transportEntry;
    if (entry) entries.push(entry);
  }

  if (entries.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 pt-3">
      {entries.map((e) => (
        <div key={e.key} className="flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-full flex-shrink-0"
            style={{ background: e.color }}
          />
          <e.Icon className="h-3.5 w-3.5 text-text-muted dark:text-text-muted" />
          <span className="type-caption">{e.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function CityMapView({ trip, timeline, activities }: Props) {
  const cities = useMemo(
    () => deriveCities(trip.destinations ?? [], timeline),
    [trip.destinations, timeline],
  );

  const [selectedCity, setSelectedCity] = useState<string>(() => cities[0] ?? '');

  const markers = useMemo(
    () => buildMarkersForCity(selectedCity, timeline, activities),
    [selectedCity, timeline, activities],
  );

  if (cities.length === 0) {
    return (
      <div className="py-16 flex flex-col items-center gap-4 text-center">
        <div className="rounded-full bg-surface p-4">
          <MapPin className="h-8 w-8 text-text-muted" />
        </div>
        <div className="space-y-1">
          <p className="font-semibold text-text-base">No destinations yet</p>
          <p className="type-caption max-w-xs">
            Import a confirmation email or PDF to add events and see them on the map.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* City selector — only shown for multi-city trips */}
      {cities.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {cities.map((city) => (
            <button
              key={city}
              onClick={() => setSelectedCity(city)}
              className={[
                'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                selectedCity === city
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-surface text-text-muted hover:text-text-base',
              ].join(' ')}
            >
              {city}
            </button>
          ))}
        </div>
      )}

      {markers.length === 0 ? (
        <div className="py-16 flex flex-col items-center gap-4 text-center">
          <div className="rounded-full bg-surface p-4">
            <MapPin className="h-8 w-8 text-text-muted" />
          </div>
          <div className="space-y-1">
            <p className="font-semibold text-text-base">Nothing to show for {selectedCity}</p>
            <p className="type-caption max-w-xs">
              Schedule activities or add hotel and transport bookings to see them here.
            </p>
          </div>
        </div>
      ) : (
        <>
          <CityMapCanvas markers={markers} cityName={selectedCity} height={420} />
          <MapLegend markers={markers} />
        </>
      )}
    </div>
  );
}
