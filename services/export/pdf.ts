/**
 * PDF export service — generates a printable trip binder using pdfmake.
 * No React dependency — pure JSON document definition.
 *
 * Structure:
 *   Cover page   (full-bleed photo, trip name, destination, dates)
 *   Quick Ref    (all flights + all hotels on one page)
 *   Daily        (2 days per page, two-column layout, compact event cards)
 *   Budget       (category table, only if expenses or budget goal exist)
 *   Expenses     (chronological expense log, only if expenses exist)
 */

import type { TripExportPayload } from './json';
import type {
  TimelineEvent,
  Activity,
  FlightDepartureEvent,
  FlightArrivalEvent,
  FlightConnectionEvent,
  HotelCheckInEvent,
  TransportDepartureEvent,
  ExpenseEvent,
  ActivityEvent,
  BudgetItemCategory,
} from '@/types';
import type { Content, TDocumentDefinitions } from './pdf-shared';
import {
  createPrinter,
  C,
  COMPASS_SVG,
  fetchImage,
  fmtDateShort,
  fmtDateMed,
  fmtTime,
  fmtCost,
  fmtCurrency,
  buildContentDays as buildContentDaysShared,
} from './pdf-shared';

// US Letter in points (8.5in × 11in)
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 40;
const COL_GAP = 10; // gap between inner event columns within a day

// Computed layout constants
const CONTENT_H = PAGE_H - 40 - 56;          // 696pt (top margin 40 + footer/bottom 56)
const CONTENT_W = PAGE_W - MARGIN * 2;        // 532pt

// Each day section in the daily itinerary takes exactly half the content area.
// We leave a 2pt gutter so the pair table (two rows + 0.5pt divider) never
// overflows the page by a rounding error.
const HALF_H = Math.floor(CONTENT_H / 2) - 1;   // 347pt

// The first daily-itinerary page also has the section heading above the pair table.
// accentBar consumes ~17pt; sectionHeading ~40pt → reserve 64pt to be safe.
const HEADING_RESERVED = 64;
const FIRST_HALF_H = Math.floor((CONTENT_H - HEADING_RESERVED) / 2) - 1; // 315pt

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Thin yellow accent bar (full content-width)
function accentBar(): Content {
  return {
    canvas: [{ type: 'rect', x: 0, y: 0, w: PAGE_W - MARGIN * 2, h: 3, color: C.yellow }],
    margin: [0, 0, 0, 14],
  };
}

function sectionHeading(text: string, marginBottom = 4): Content {
  return { text, font: 'Times', fontSize: 18, bold: true, color: C.nearBlack, margin: [0, 0, 0, marginBottom] };
}

// ─── Compact event card (for two-column daily layout) ─────────────────────────
// Uses a two-cell table: 3pt color bar | content

function eventCard(accentColor: string, title: string, details: string[]): Content {
  const filteredDetails = details.filter(Boolean);
  return {
    table: {
      widths: [3, '*'],
      body: [[
        { border: [false, false, false, false], fillColor: accentColor, text: '' },
        {
          border: [false, false, false, false],
          fillColor: C.surface,
          stack: [
            {
              text: title,
              fontSize: 8.5,
              bold: true,
              color: C.nearBlack,
              margin: [0, 0, 0, filteredDetails.length ? 1 : 0],
            },
            ...filteredDetails.map((d) => ({ text: d, fontSize: 7.5, color: C.muted, lineHeight: 1.3 })),
          ],
          margin: [6, 4, 6, 4],
        },
      ]],
    },
    layout: {
      defaultBorder: false,
      paddingLeft: () => 0, paddingRight: () => 0,
      paddingTop: () => 0, paddingBottom: () => 0,
    },
    margin: [0, 0, 0, 4],
  };
}

// ─── Day event items ──────────────────────────────────────────────────────────
// Builds a flat array of event cards for a single day (expenses excluded).
// Used by buildDaySection which decides whether to lay them out in 1 or 2 columns.

function buildEventItems(events: TimelineEvent[], dayActivities: Activity[]): Content[] {
  const items: Content[] = [];

  for (const e of events) {
    if (e.type !== 'flight') continue;
    if (e.subtype === 'departure') {
      const f = e as FlightDepartureEvent;
      items.push(eventCard(
        C.flightBlue,
        `Depart ${f.flightNo} · ${f.departureAirport} → ${f.arrivalAirport}${f.time ? ' ' + fmtTime(f.time) : ''}`,
        [
          [f.bookingRef && `Ref: ${f.bookingRef}`, f.seatNumber && `Seat ${f.seatNumber}`, f.travelClass].filter(Boolean).join(' · '),
          f.gate ? `Gate ${f.gate}` : '',
        ],
      ));
    } else if (e.subtype === 'arrival') {
      const f = e as FlightArrivalEvent;
      items.push(eventCard(C.flightBlue, `Arrive ${f.flightNo} · ${f.arrivalAirport}${f.time ? ' ' + fmtTime(f.time) : ''}`, []));
    } else if (e.subtype === 'connection') {
      const f = e as FlightConnectionEvent;
      items.push(eventCard(C.flightBlue, `Connection · ${f.connectionAirport}`, [
        f.layoverMinutes ? `${Math.floor(f.layoverMinutes / 60)}h ${f.layoverMinutes % 60}m layover` : '',
      ]));
    }
  }

  for (const e of events) {
    if (e.type !== 'hotel' || e.subtype !== 'check_in') continue;
    const h = e as HotelCheckInEvent;
    items.push(eventCard(C.hotelTerra, `Check in · ${h.hotelName}`, [
      [h.roomType, h.breakfastIncluded && 'Breakfast included'].filter(Boolean).join(' · '),
      [h.bookingRef && `Ref: ${h.bookingRef}`, h.checkoutDate && `Check-out: ${fmtDateShort(h.checkoutDate)}`].filter(Boolean).join(' · '),
      h.locationAddress ?? '',
    ]));
  }

  for (const e of events) {
    if (e.type !== 'otherTransportation' || e.subtype !== 'departure') continue;
    const t = e as TransportDepartureEvent;
    const typeName = t.transportType.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    items.push(eventCard(C.flightBlue, `${typeName} · ${t.departureLocation} → ${t.arrivalLocation}`, [
      [t.vendor, t.bookingRef && `Ref: ${t.bookingRef}`].filter(Boolean).join(' · '),
      t.locationAddress ?? '',
    ]));
  }

  for (const e of events) {
    if (e.type !== 'activity') continue;
    const a = e as ActivityEvent;
    items.push(eventCard(C.activityGreen, a.description, [
      [a.duration, a.cost ? fmtCost(a.cost) : ''].filter(Boolean).join(' · '),
      a.bookingRef ? `Ref: ${a.bookingRef}` : '',
      a.locationAddress ?? '',
    ]));
  }

  for (const a of dayActivities) {
    items.push(eventCard(C.activityGreen, a.name, [
      [a.duration, a.scheduledTime ? fmtTime(a.scheduledTime) : ''].filter(Boolean).join(' · '),
      a.address ?? '',
    ]));
  }

  return items;
}

// ─── Day content helpers ──────────────────────────────────────────────────────

const buildContentDays = buildContentDaysShared;

/**
 * Build the most interesting Unsplash search query for a day.
 * Prefers a specific activity name + city over a bare city name.
 */
function buildDayPhotoQuery(events: TimelineEvent[], dayActivities: Activity[]): string {
  const city = events.find((e) => e.locationCity)?.locationCity ?? '';

  const activityNames = [
    ...events.filter((e) => e.type === 'activity').map((e) => (e as ActivityEvent).description),
    ...dayActivities.map((a) => a.name),
  ].filter(Boolean);

  if (activityNames.length > 0) {
    // Prefer the most descriptive (longest) name; take first 3 words to keep the query focused
    const best = activityNames.sort((a, b) => b.length - a.length)[0];
    const keywords = best.split(/\s+/).slice(0, 3).join(' ');
    return city ? `${city} ${keywords}` : keywords;
  }

  return city || 'travel';
}

/**
 * Fetch a day-specific photo from Unsplash at the given pixel dimensions.
 * Uses center-crop so the whole scene is visible at scale — not a zoomed snippet.
 * Returns a base64 data URI, or null on failure.
 */
async function fetchDayPhotoData(
  query: string,
  fetchW: number,
  fetchH: number,
  accessKey: string,
): Promise<string | null> {
  try {
    const searchUrl = new URL('https://api.unsplash.com/search/photos');
    searchUrl.searchParams.set('query', query);
    searchUrl.searchParams.set('per_page', '3');
    searchUrl.searchParams.set('order_by', 'relevant');
    const searchRes = await fetch(searchUrl.toString(), {
      headers: { Authorization: `Client-ID ${accessKey}` },
    });
    if (!searchRes.ok) return null;

    const data = (await searchRes.json()) as {
      results?: Array<{ urls?: { raw?: string; regular?: string } }>;
    };
    const rawUrl = data.results?.[0]?.urls?.raw;
    const fallbackUrl = data.results?.[0]?.urls?.regular;
    if (!rawUrl && !fallbackUrl) return null;

    // Use Unsplash's imgix CDN: scale photo down to our required size and center-crop.
    // center crop shows the full scene in context rather than an out-of-context detail.
    let photoUrl: string;
    if (rawUrl) {
      const u = new URL(rawUrl);
      u.searchParams.set('w', String(fetchW));
      u.searchParams.set('h', String(fetchH));
      u.searchParams.set('fit', 'crop');
      u.searchParams.set('crop', 'center');
      u.searchParams.set('q', '80');
      u.searchParams.set('fm', 'jpg');
      photoUrl = u.toString();
    } else {
      photoUrl = fallbackUrl!;
    }

    const imgRes = await fetch(photoUrl);
    if (!imgRes.ok) return null;
    const buf = await imgRes.arrayBuffer();
    const mime = imgRes.headers.get('content-type') ?? 'image/jpeg';
    return `data:${mime};base64,${Buffer.from(buf).toString('base64')}`;
  } catch {
    return null;
  }
}

// ─── Day section (half-page) ──────────────────────────────────────────────────
//
// Two photo placement strategies, chosen by event density:
//
//   Layout A (≤5 events) — events stack in 1 or 2 columns at the top; a full-width
//     panoramic banner photo (4:1 ratio, 130pt tall) fills the space below them.
//     This gives light days a strong visual anchor.
//
//   Layout B (≥6 events) — two equal event columns; the photo is placed at the
//     bottom of the second column (16:9 widescreen, colWidth wide), turning unused
//     column space into an editorial window rather than an awkward gap.
//
// All photos have 12pt top margin for breathing room.
// Aspect ratio is fixed per layout type so photos always read as whole scenes.

const PHOTO_BANNER_H = 110;  // Layout A: full-width banner height (pt) → ~4.7:1 ratio
// Layout B: col photo height is computed as round(colW × 0.5) at call time → 1:2 ratio

function buildDaySection(
  day: string,
  dayNumber: number,
  events: TimelineEvent[],
  dayActivities: Activity[],
  dayPhotoKey: string | null,
  _sectionHeight: number,   // reserved for future use; not needed now
): Content {
  const city = events.find((e) => e.locationCity)?.locationCity ?? '';

  const dayHeader: Content = {
    table: {
      widths: [3, '*'],
      body: [[
        { border: [false, false, false, false], fillColor: C.yellow, text: '' },
        {
          border: [false, false, false, false],
          fillColor: C.surface,
          stack: [
            { text: `Day ${dayNumber}  ·  ${fmtDateMed(day)}`, font: 'Times', fontSize: 11, bold: true, color: C.nearBlack, margin: [0, 0, 0, city ? 1 : 0] },
            ...(city ? [{ text: city, fontSize: 8, color: C.muted }] : []),
          ],
          margin: [8, 6, 8, 6],
        },
      ]],
    },
    layout: { defaultBorder: false, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 },
    margin: [0, 0, 0, 7],
  } as Content;

  const eventItems = buildEventItems(events, dayActivities);
  const eventCount = eventItems.length;

  // ── Layout B: dense days (≥6 events) ─────────────────────────────────────
  // Photo goes in the column with fewer events (col2 when split is uneven).
  // When both columns have the same number of events, alternate by dayNumber
  // so the photo shifts sides across the PDF instead of always landing right.
  if (eventCount >= 6 && dayPhotoKey) {
    const mid = Math.ceil(eventCount / 2);
    const col1 = eventItems.slice(0, mid);
    const col2 = eventItems.slice(mid);
    const colW = Math.round((CONTENT_W - COL_GAP) / 2);
    const photoH = Math.round(colW * 0.5); // 16:9 widescreen

    // Equal split (even event count) → alternate; unequal → shorter column gets the photo
    const photoInCol1 = col1.length === col2.length
      ? dayNumber % 2 === 0
      : col1.length < col2.length;

    const photoBlock = { image: dayPhotoKey, width: colW, height: photoH, margin: [0, 12, 0, 0] };

    return {
      stack: [
        dayHeader,
        {
          columns: [
            {
              width: '*',
              stack: photoInCol1 ? [...col1, photoBlock] : col1,
            },
            { width: COL_GAP, text: '' },
            {
              width: '*',
              stack: photoInCol1 ? col2 : [...col2, photoBlock],
            },
          ],
        } as unknown as Content,
      ],
    } as unknown as Content;
  }

  // ── Layout A: events + full-width banner photo at the bottom ─────────────
  // 2-column events when there are ≥5 items to avoid crowding the left side
  let eventsContent: Content;
  if (eventCount >= 5) {
    const mid = Math.ceil(eventCount / 2);
    eventsContent = {
      columns: [
        { width: '*', stack: eventItems.slice(0, mid) },
        { width: COL_GAP, text: '' },
        { width: '*', stack: eventItems.slice(mid) },
      ],
    } as unknown as Content;
  } else {
    eventsContent = { stack: eventItems } as unknown as Content;
  }

  const photo: Content[] = dayPhotoKey
    ? [{ image: dayPhotoKey, width: CONTENT_W, height: PHOTO_BANNER_H, margin: [0, 12, 0, 0] } as unknown as Content]
    : [];

  return { stack: [dayHeader, eventsContent, ...photo] } as unknown as Content;
}

// ─── Cover page ───────────────────────────────────────────────────────────────

function coverContent(payload: TripExportPayload, hasCoverImage: boolean): Content[] {
  const { trip } = payload;

  const dateRange = (() => {
    if (!trip.startDate && !trip.endDate) return '';
    const fmt = (d: string) =>
      new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    if (trip.startDate && trip.endDate && trip.startDate !== trip.endDate)
      return `${fmt(trip.startDate)} – ${fmt(trip.endDate)}`;
    return fmt((trip.startDate ?? trip.endDate)!);
  })();

  const destinations = trip.destinations.length > 1 ? trip.destinations.join(' · ') : trip.destination;

  const textColor = hasCoverImage ? C.white : C.nearBlack;
  const subColor = hasCoverImage ? '#E5E7EB' : C.muted;

  return [
    // TravelBuddy wordmark badge — Variant A (pill shape per design system)
    // Layer: yellow pill canvas → Compass SVG → wordmark text
    {
      canvas: [{ type: 'rect', x: 0, y: 0, w: 116, h: 24, r: 12, color: C.yellow }],
      absolutePosition: { x: MARGIN, y: 16 },
    } as unknown as Content,
    {
      svg: COMPASS_SVG,
      width: 14,
      height: 14,
      absolutePosition: { x: MARGIN + 7, y: 21 },
    } as unknown as Content,
    {
      text: 'TravelBuddy',
      font: 'Times',
      fontSize: 12,
      bold: true,
      color: C.nearBlack,
      absolutePosition: { x: MARGIN + 26, y: 24 },
    } as unknown as Content,
    // Trip name — big serif anchored a fixed distance above the bottom edge
    // (anchored to the bottom rather than a fixed y so it holds its position if PAGE_H changes)
    {
      text: trip.name,
      absolutePosition: { x: MARGIN, y: PAGE_H - 261.89 },
      font: 'Times',
      fontSize: 40,
      bold: true,
      color: textColor,
      lineHeight: 1.1,
      // maxWidth keeps long names from running to the edge
    } as unknown as Content,
    // Destinations — allow up to 3 lines at 14pt (≈20pt/line) below the title
    ...(destinations ? [{
      text: destinations,
      absolutePosition: { x: MARGIN, y: PAGE_H - 193.89 },
      fontSize: 13,
      color: subColor,
      // wrap within content width so it doesn't collide with the right edge
      width: PAGE_W - MARGIN * 2,
    } as unknown as Content] : []),
    // Date range — fixed 36pt below the destinations baseline (generous gap)
    ...(dateRange ? [{
      text: dateRange,
      absolutePosition: { x: MARGIN, y: PAGE_H - 121.89 },
      fontSize: 11,
      color: hasCoverImage ? '#9CA3AF' : C.muted,
    } as unknown as Content] : []),
    // Spacer fills the page → page break ends the cover.
    // Must stay within CONTENT_H or it overflows to page 2 and creates a blank page.
    // CONTENT_H - 20 leaves room for the empty text element's own line height (~13pt).
    {
      text: '',
      margin: [0, CONTENT_H - 20, 0, 0],
      pageBreak: 'after',
    } as Content,
  ];
}

// ─── Quick Reference ──────────────────────────────────────────────────────────

function quickReferenceContent(payload: TripExportPayload, hasStaticMap: boolean): Content[] {
  const { trip, timeline } = payload;

  const byDate = (a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date);
  const flights = timeline.filter((e): e is FlightDepartureEvent => e.type === 'flight' && e.subtype === 'departure').sort(byDate);
  const hotels = timeline.filter((e): e is HotelCheckInEvent => e.type === 'hotel' && e.subtype === 'check_in').sort(byDate);
  const transports = timeline.filter((e): e is TransportDepartureEvent => e.type === 'otherTransportation' && e.subtype === 'departure').sort(byDate);

  const hdr = { fontSize: 8, bold: true, color: C.muted, fillColor: C.white };
  const cell = { fontSize: 8.5, color: C.nearBlack };
  const mut = { fontSize: 8.5, color: C.muted };
  const tableLayout = {
    hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
      i === 0 || i === 1 || i === node.table.body.length ? 1 : 0.5,
    hLineColor: () => C.border,
    vLineWidth: () => 0,
    paddingTop: () => 5,
    paddingBottom: () => 5,
  };

  const items: Content[] = [
    accentBar(),
    sectionHeading('Quick Reference'),
    { text: `${trip.name} · All bookings at a glance`, fontSize: 9, color: C.muted, margin: [0, 0, 0, hasStaticMap ? 12 : 18] },
  ];

  // Route map — fetched from Google Maps Static API and registered as 'routeMap' in images dict
  if (hasStaticMap) {
    items.push({
      image: 'routeMap',
      width: CONTENT_W,
      margin: [0, 0, 0, 18],
    } as Content);
  }

  const TRANSPORT_LABELS: Record<string, string> = {
    bus: 'Bus', train: 'Train', ferry: 'Ferry', car_rental: 'Car Rental',
    taxi: 'Taxi', rideshare: 'Rideshare', other: 'Transport',
  };

  if (flights.length > 0) {
    items.push({ text: 'FLIGHTS', fontSize: 8, bold: true, color: C.muted, margin: [0, 0, 0, 6] });
    items.push({
      table: {
        headerRows: 1,
        widths: ['10%', '20%', '13%', '10%', '10%', '10%', '*'],
        body: [
          [{ text: 'Flight', ...hdr }, { text: 'Route', ...hdr }, { text: 'Date', ...hdr }, { text: 'Time', ...hdr }, { text: 'Seat', ...hdr }, { text: 'Class', ...hdr }, { text: 'Ref', ...hdr }],
          ...flights.map((f) => [
            { text: f.flightNo, ...cell, bold: true },
            { text: `${f.departureAirport} → ${f.arrivalAirport}`, ...cell },
            { text: fmtDateShort(f.date), ...mut },
            { text: fmtTime(f.time) || '—', ...mut },
            { text: f.seatNumber || '—', ...mut },
            { text: f.travelClass || '—', ...mut },
            { text: f.bookingRef || '—', ...mut },
          ]),
        ],
      },
      layout: tableLayout,
      margin: [0, 0, 0, transports.length > 0 || hotels.length > 0 ? 18 : 0],
    } as Content);
  }

  if (transports.length > 0) {
    items.push({ text: 'GROUND & WATER TRANSPORT', fontSize: 8, bold: true, color: C.muted, margin: [0, 0, 0, 6] });
    items.push({
      table: {
        headerRows: 1,
        widths: ['15%', '*', '*', '13%', '10%', '18%'],
        body: [
          [{ text: 'Type', ...hdr }, { text: 'From', ...hdr }, { text: 'To', ...hdr }, { text: 'Date', ...hdr }, { text: 'Time', ...hdr }, { text: 'Ref', ...hdr }],
          ...transports.map((t) => [
            { text: TRANSPORT_LABELS[t.transportType] ?? t.transportType, ...cell, bold: true },
            { text: t.departureLocation, ...cell },
            { text: t.arrivalLocation, ...cell },
            { text: fmtDateShort(t.date), ...mut },
            { text: fmtTime(t.time) || '—', ...mut },
            { text: t.bookingRef || '—', ...mut },
          ]),
        ],
      },
      layout: tableLayout,
      margin: [0, 0, 0, hotels.length > 0 ? 18 : 0],
    } as Content);
  }

  if (hotels.length > 0) {
    items.push({ text: 'ACCOMMODATION', fontSize: 8, bold: true, color: C.muted, margin: [0, 0, 0, 6] });
    items.push({
      table: {
        headerRows: 1,
        widths: ['*', '20%', '13%', '13%', '18%'],
        body: [
          [{ text: 'Hotel', ...hdr }, { text: 'City', ...hdr }, { text: 'Check-in', ...hdr }, { text: 'Check-out', ...hdr }, { text: 'Ref', ...hdr }],
          ...hotels.map((h) => [
            { text: h.hotelName, ...cell, bold: true },
            { text: h.locationCity, ...mut },
            { text: fmtDateShort(h.date), ...mut },
            { text: fmtDateShort(h.checkoutDate), ...mut },
            { text: h.bookingRef || '—', ...mut },
          ]),
        ],
      },
      layout: tableLayout,
      margin: [0, 0, 0, 0],
    } as Content);
  }

  return items;
}

// ─── Daily Itinerary — 2 days per page, each day half a page ─────────────────

function dailyItineraryContent(
  payload: TripExportPayload,
  dayPhotoMap: Record<string, string>,
): Content[] {
  const contentDays = buildContentDays(payload);
  if (contentDays.length === 0) return [];

  // Table layout: zero padding so day sections fill the cell cleanly.
  // heights property ensures each row is at least half a page tall.
  const dayTableLayout = {
    hLineWidth: (i: number) => (i === 1 ? 0.5 : 0),
    hLineColor: () => C.border,
    vLineWidth: () => 0,
    paddingTop: () => 0,
    paddingBottom: () => 0,
    paddingLeft: () => 0,
    paddingRight: () => 0,
  };

  const items: Content[] = [
    Object.assign(accentBar() as object, { pageBreak: 'before' }) as Content,
    sectionHeading('Daily Itinerary', 14),
  ];

  // Emit days in pairs. Each pair lives in a 2-row, 1-column table with fixed row heights
  // so each day occupies exactly half the page (FIRST_HALF_H on page 1, HALF_H thereafter).
  for (let i = 0; i < contentDays.length; i += 2) {
    const a = contentDays[i];
    const b = contentDays[i + 1];
    const rowHeight = i === 0 ? FIRST_HALF_H : HALF_H;

    const rowA = buildDaySection(a.day, a.dayNumber, a.events, a.dayActivities, dayPhotoMap[a.day] ?? null, rowHeight);
    const rowB = b
      ? buildDaySection(b.day, b.dayNumber, b.events, b.dayActivities, dayPhotoMap[b.day] ?? null, rowHeight)
      : ({ text: '' } as Content);

    const pairTable: Content = {
      table: {
        widths: ['*'],
        heights: [rowHeight, rowHeight],
        dontBreakRows: true,   // prevent pdfmake from splitting a day row across pages
        body: [
          [{ border: [false, false, false, true], stack: [rowA] }],
          [{ border: [false, false, false, false], stack: [rowB] }],
        ],
      },
      layout: dayTableLayout,
    } as unknown as Content;

    if (i === 0) {
      items.push(pairTable);
    } else {
      items.push(Object.assign(pairTable as object, { pageBreak: 'before' }) as Content);
    }
  }

  return items;
}

// ─── Budget Summary ───────────────────────────────────────────────────────────

const BUDGET_CATEGORIES: BudgetItemCategory[] = [
  'flights', 'hotels', 'car_rental', 'activities', 'transport', 'food', 'insurance', 'other',
];
const CATEGORY_LABELS: Record<BudgetItemCategory, string> = {
  flights: 'Flights', hotels: 'Hotels', car_rental: 'Car Rental', activities: 'Activities',
  transport: 'Transport', food: 'Food & Drink', insurance: 'Insurance', other: 'Other',
};
const EXPENSE_TO_BUDGET: Record<string, BudgetItemCategory> = {
  flights: 'flights', hotels: 'hotels', food: 'food', transport: 'transport',
  activities: 'activities', shopping: 'other', insurance: 'insurance', other: 'other',
};

function budgetContent(payload: TripExportPayload): Content[] {
  const { trip, timeline } = payload;
  const expenses = timeline.filter((e): e is ExpenseEvent => e.type === 'expense');
  if (expenses.length === 0 && !trip.budgetGoal) return [];

  const actualByCategory = new Map<BudgetItemCategory, number>();
  for (const e of expenses) {
    const cat = EXPENSE_TO_BUDGET[e.category] ?? 'other';
    actualByCategory.set(cat, (actualByCategory.get(cat) ?? 0) + e.cost.amountPreferredCurrency);
  }
  const totalActual = expenses.reduce((s, e) => s + e.cost.amountPreferredCurrency, 0);
  const rows = BUDGET_CATEGORIES.filter((cat) => actualByCategory.has(cat) || trip.categoryGoals?.[cat]);

  const hdr = { fontSize: 8, bold: true, color: C.muted, fillColor: C.white };
  const cell = { fontSize: 9, color: C.nearBlack };
  const tot = { fontSize: 9, bold: true, color: C.nearBlack };

  return [
    Object.assign(accentBar() as object, { pageBreak: 'before' }) as Content,
    sectionHeading('Budget Summary'),
    { text: `${trip.name} · ${trip.preferredCurrency}`, fontSize: 9, color: C.muted, margin: [0, 0, 0, 16] },
    {
      table: {
        headerRows: 1,
        widths: ['*', '22%', '22%', '22%'],
        body: [
          [
            { text: 'Category', ...hdr },
            { text: 'Budget', ...hdr, alignment: 'right' },
            { text: 'Actual', ...hdr, alignment: 'right' },
            { text: 'Remaining', ...hdr, alignment: 'right' },
          ],
          ...rows.map((cat) => {
            const actual = actualByCategory.get(cat) ?? 0;
            const goal = trip.categoryGoals?.[cat];
            const remaining = goal !== undefined ? goal - actual : null;
            return [
              { text: CATEGORY_LABELS[cat], ...cell },
              { text: goal !== undefined ? fmtCurrency(goal, trip.preferredCurrency) : '—', ...cell, alignment: 'right' },
              { text: actual > 0 ? fmtCurrency(actual, trip.preferredCurrency) : '—', ...cell, alignment: 'right' },
              { text: remaining !== null ? fmtCurrency(remaining, trip.preferredCurrency) : '—', ...cell, alignment: 'right', color: remaining !== null && remaining < 0 ? C.red : C.activityGreen },
            ];
          }),
          [
            { text: 'Total', ...tot },
            { text: trip.budgetGoal ? fmtCurrency(trip.budgetGoal, trip.preferredCurrency) : '—', ...tot, alignment: 'right' },
            { text: fmtCurrency(totalActual, trip.preferredCurrency), ...tot, alignment: 'right' },
            {
              text: trip.budgetGoal ? fmtCurrency(trip.budgetGoal - totalActual, trip.preferredCurrency) : '—',
              ...tot, alignment: 'right',
              color: trip.budgetGoal && totalActual > trip.budgetGoal ? C.red : C.activityGreen,
            },
          ],
        ],
      },
      layout: {
        hLineWidth: (i: number, node: { table: { body: unknown[] } }) => {
          const isPreTotal = i === node.table.body.length - 1;
          return i === 0 || i === 1 || i === node.table.body.length || isPreTotal ? 1 : 0.5;
        },
        hLineColor: (i: number, node: { table: { body: unknown[] } }) =>
          i >= node.table.body.length - 1 ? C.nearBlack : C.border,
        vLineWidth: () => 0,
        paddingTop: () => 5,
        paddingBottom: () => 5,
      },
    } as Content,
  ];
}

// ─── Expense log ──────────────────────────────────────────────────────────────

function expenseLogContent(payload: TripExportPayload): Content[] {
  const { trip, timeline } = payload;
  const expenses = timeline.filter((e): e is ExpenseEvent => e.type === 'expense');
  if (expenses.length === 0) return [];

  const sorted = [...expenses].sort((a, b) => a.date.localeCompare(b.date));
  const hdr = { fontSize: 8, bold: true, color: C.muted, fillColor: C.white };
  const cell = { fontSize: 8.5, color: C.nearBlack };
  const mut = { fontSize: 8.5, color: C.muted };

  return [
    Object.assign(accentBar() as object, { pageBreak: 'before' }) as Content,
    sectionHeading('Expenses'),
    { text: `${trip.name} · ${trip.preferredCurrency}`, fontSize: 9, color: C.muted, margin: [0, 0, 0, 16] },
    {
      table: {
        headerRows: 1,
        widths: ['14%', '*', '18%', '18%'],
        body: [
          [
            { text: 'Date', ...hdr },
            { text: 'Description', ...hdr },
            { text: 'Category', ...hdr },
            { text: 'Amount', ...hdr, alignment: 'right' },
          ],
          ...sorted.map((e) => [
            { text: fmtDateShort(e.date), ...mut },
            { text: e.description + (e.vendor ? ` · ${e.vendor}` : ''), ...cell },
            { text: CATEGORY_LABELS[EXPENSE_TO_BUDGET[e.category] ?? 'other'] ?? e.category, ...mut },
            { text: fmtCost(e.cost), ...cell, alignment: 'right', bold: true },
          ]),
        ],
      },
      layout: {
        hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
          i === 0 || i === 1 || i === node.table.body.length ? 1 : 0.5,
        hLineColor: () => C.border,
        vLineWidth: () => 0,
        paddingTop: () => 4,
        paddingBottom: () => 4,
      },
    } as Content,
  ];
}

// ─── Static route map URL builder ────────────────────────────────────────────
// Replicates the waypoint logic from TransportRouteMap.tsx for server-side use.
// Returns a Google Maps Static API URL, or '' if there are fewer than 2 waypoints.

// Extract IATA/ICAO code from strings like "Toronto Pearson (YYZ)" → "YYZ".
// Falls back to stripping the parenthetical and returning the plain name.
function cleanAirport(s: string): string {
  const code = s.match(/\(([A-Z]{3,4})\)\s*$/)?.[1];
  if (code) return code;
  return s.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

interface MapWaypoint {
  label: string;
  position?: { lat: number; lng: number };
}

function buildStaticMapUrl(payload: TripExportPayload, apiKey: string): string {
  const { timeline } = payload;

  const byDate = (a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date);

  // Collect waypoints from flights (IATA codes) AND ground transport (canonical names +
  // coordinates set at import time by normalizeTransportLocations).
  const transports = timeline
    .filter(
      (e) =>
        (e.type === 'flight' && e.subtype === 'departure') ||
        (e.type === 'otherTransportation' && e.subtype === 'departure'),
    )
    .sort(byDate);

  const waypoints: MapWaypoint[] = [];
  const push = (label: string, position?: { lat: number; lng: number }) => {
    const last = waypoints[waypoints.length - 1];
    if (!last || last.label !== label) waypoints.push({ label, position });
  };

  for (const e of transports) {
    if (e.type === 'flight') {
      const f = e as FlightDepartureEvent;
      push(cleanAirport(f.departureAirport));
      push(cleanAirport(f.arrivalAirport));
    } else {
      const t = e as TransportDepartureEvent;
      push(t.departureLocation, t.departurePosition);
      push(t.arrivalLocation, t.arrivalPosition);
    }
  }

  if (waypoints.length < 2) return '';

  const size = `${Math.round(CONTENT_W)}x160`;
  const base = `https://maps.googleapis.com/maps/api/staticmap?size=${size}&maptype=roadmap&scale=2&key=${apiKey}`;

  // Prefer lat,lng coordinates — no geocoding needed on Google's side, no encoding ambiguity.
  // Fall back to canonical name strings when coordinates are unavailable (e.g. flights, old data).
  const allHavePositions = waypoints.every((w) => w.position);
  const pathPoints = waypoints.map((w) =>
    w.position ? `${w.position.lat},${w.position.lng}` : encodeURIComponent(w.label),
  );

  // Use %7C (percent-encoded pipe) as the path separator — more reliable than literal |
  // when the URL passes through Node.js's fetch/URL parser.
  const sep = '%7C';
  const pathPart = `path=color:0x1D4ED8FF${sep}weight:3${sep}${pathPoints.join(sep)}`;

  console.log(
    `[PDF export] Static map: ${waypoints.length} waypoints, ` +
    `${allHavePositions ? 'all coords' : 'mixed (some text)'}: ` +
    waypoints.map((w) => w.label).join(' → '),
  );
  return `${base}&${pathPart}`;
}

// ─── Render entry point ───────────────────────────────────────────────────────

export async function renderTripBinderPdf(payload: TripExportPayload): Promise<Buffer> {
  // Fetch cover image + static route map in parallel
  let coverImageData: string | null = null;
  let staticMapData: string | null = null;

  const coverFetch = payload.trip.coverPhotoUrl
    ? fetchImage(payload.trip.coverPhotoUrl, 'cover photo')
    : Promise.resolve(null);

  // Google Maps Static API respects HTTP referrer restrictions set on the key.
  // Server-side requests have no Referer header by default, which causes a 403
  // when the key is restricted to specific domains. Sending the app's base URL
  // as Referer satisfies the restriction without exposing anything sensitive.
  const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? process.env.GOOGLE_MAPS_API_KEY;
  const staticMapUrl = mapsApiKey ? buildStaticMapUrl(payload, mapsApiKey) : '';
  if (staticMapUrl) {
    console.log('[PDF export] Static map URL:', staticMapUrl);
  } else if (mapsApiKey) {
    console.log('[PDF export] Static map skipped — trip has fewer than 2 transport waypoints');
  } else {
    console.log('[PDF export] Static map skipped — no NEXT_PUBLIC_GOOGLE_MAPS_API_KEY or GOOGLE_MAPS_API_KEY');
  }
  const appBaseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
  const mapFetch = staticMapUrl
    ? fetchImage(staticMapUrl, 'static map', { headers: { Referer: appBaseUrl } })
    : Promise.resolve(null);

  [coverImageData, staticMapData] = await Promise.all([coverFetch, mapFetch]);

  // Build images registry — all images referenced by key in content must be registered here
  const images: Record<string, string> = {};
  if (coverImageData) images.cover = coverImageData;
  if (staticMapData) images.routeMap = staticMapData;

  // Fetch per-day Unsplash photos in parallel.
  // Pixel dimensions match the layout type chosen by buildDaySection so the crop shows
  // the full scene at the correct aspect ratio, not a zoomed-in snippet.
  const dayPhotoMap: Record<string, string> = {};
  const unsplashKey = process.env.UNSPLASH_ACCESS_KEY;
  if (unsplashKey) {
    const contentDays = buildContentDays(payload);
    await Promise.all(
      contentDays.map(async ({ day, events, dayActivities }) => {
        const eventCount = buildEventItems(events, dayActivities).length;

        let fetchW: number, fetchH: number;
        if (eventCount >= 6) {
          // Layout B: 1:2 column photo (colW × colW*0.5), 2× for print quality
          const colW = Math.round((CONTENT_W - COL_GAP) / 2);
          fetchW = colW * 2;
          fetchH = Math.round(colW * 0.5) * 2;
        } else {
          // Layout A: 4:1 panoramic full-width banner (CONTENT_W × PHOTO_BANNER_H), 2×
          fetchW = Math.round(CONTENT_W) * 2;
          fetchH = PHOTO_BANNER_H * 2;
        }

        const query = buildDayPhotoQuery(events, dayActivities);
        const data = await fetchDayPhotoData(query, fetchW, fetchH, unsplashKey);
        if (data) {
          const key = `dayPhoto_${day}`;
          images[key] = data;
          dayPhotoMap[day] = key;
        }
      }),
    );
  }

  const printer = createPrinter();

  const docDefinition: TDocumentDefinitions = {
    pageSize: 'LETTER',
    pageMargins: [MARGIN, MARGIN, MARGIN, 56],
    info: {
      title: payload.trip.name,
      author: 'TravelBuddy',
      subject: `${payload.trip.destination} — Trip Binder`,
    },
    images,
    // Cover page background: full-bleed photo (or yellow fallback) + dark overlay + yellow top bar
    background: (currentPage, pageSize) => {
      if (currentPage !== 1) return null;
      const items: Content[] = [];

      if (coverImageData) {
        // Reference by key from the images dictionary
        items.push({ image: 'cover', width: pageSize.width, height: pageSize.height, absolutePosition: { x: 0, y: 0 } });
        // Dark overlay using fillOpacity on canvas rect
        items.push({
          canvas: [{ type: 'rect', x: 0, y: 0, w: pageSize.width, h: pageSize.height, color: '#000000', fillOpacity: 0.55 }],
          absolutePosition: { x: 0, y: 0 },
        } as unknown as Content);
      } else {
        items.push({
          canvas: [{ type: 'rect', x: 0, y: 0, w: pageSize.width, h: pageSize.height, color: '#FACC15' }],
          absolutePosition: { x: 0, y: 0 },
        } as Content);
      }

      // Yellow top bar
      items.push({
        canvas: [{ type: 'rect', x: 0, y: 0, w: pageSize.width, h: 5, color: C.yellow }],
        absolutePosition: { x: 0, y: 0 },
      } as Content);

      return items;
    },
    // Footer — skip on cover page
    footer: (currentPage, pageCount) => {
      if (currentPage === 1) return null;
      return {
        margin: [MARGIN, 8, MARGIN, 0],
        columns: [
          { text: 'TravelBuddy', fontSize: 8, color: C.light },
          { text: payload.trip.name, fontSize: 8, color: C.light, alignment: 'center' },
          { text: `${currentPage} / ${pageCount}`, fontSize: 8, color: C.light, alignment: 'right' },
        ],
      };
    },
    content: [
      ...coverContent(payload, !!coverImageData),
      ...quickReferenceContent(payload, !!staticMapData),
      ...dailyItineraryContent(payload, dayPhotoMap),
      ...budgetContent(payload),
      ...expenseLogContent(payload),
    ],
    defaultStyle: {
      font: 'Helvetica',
      fontSize: 9,
      color: C.nearBlack,
      lineHeight: 1.4,
    },
  };

  const pdfDoc = await printer.createPdfKitDocument(docDefinition);

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    pdfDoc.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
    pdfDoc.on('error', (err: Error) => reject(err));
    pdfDoc.end();
  });
}
