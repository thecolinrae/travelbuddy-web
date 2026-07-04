/**
 * Agenda PDF export — a printable day-planner view, adapted from Outlook-style
 * schedule editors for paper: landscape orientation, two days per page (each
 * confined to its own half of the page — left/right columns), a ruled
 * half-hour grid with times down the side, and events drawn as colored blocks
 * stretching from start time to finish time. Overlapping events split into
 * side-by-side lanes instead of stacking, so a busy hour never grows taller
 * than the fixed slot height.
 *
 * The hour range (e.g. 8am–8pm) is chosen by the caller before generating —
 * see AGENDA_MAX_HOURS below for the largest range that still fits within a
 * single half-page column without overflowing.
 *
 * An optional "booklet" mode reorders the physical pages into saddle-stitch
 * signature order, so printing double-sided and folding the whole stack in
 * half along the vertical centerline (then stapling the spine) produces a
 * booklet that reads in the correct day order — see buildBookletPageSlots.
 */

import type { TripExportPayload } from './json';
import type {
  Activity,
  ActivityEvent,
  FlightArrivalEvent,
  FlightConnectionEvent,
  FlightDepartureEvent,
  HotelCheckInEvent,
  HotelCheckOutEvent,
  TimelineEvent,
  TransportArrivalEvent,
  TransportDepartureEvent,
} from '@/types';
import type { Content, TDocumentDefinitions, ContentDay } from './pdf-shared';
import { createPrinter, C, fmtDateMed, fmtTime, fmtCost, buildContentDays } from './pdf-shared';

// US Letter, landscape (11in × 8.5in)
const PAGE_W = 792;
const PAGE_H = 612;
const MARGIN = 30;
const FOOTER_EXTRA = 18; // extra bottom margin reserved for the footer, beyond MARGIN
const COL_GAP = 22;

const CONTENT_H = PAGE_H - MARGIN * 2 - FOOTER_EXTRA;

const HEADER_H = 26; // day header block
const ANYTIME_LINE_H = 12; // per line, only reserved when there's untimed/out-of-range content

// Fixed, never-adaptive slot height — every half hour renders identically no
// matter how many hours are shown or how busy a day is. This is the number
// that "each day should not extend off its half page" is built around.
const SLOT_H = 15; // pt per half-hour
export const AGENDA_DEFAULT_START_HOUR = 8;
export const AGENDA_DEFAULT_END_HOUR = 20;
// Largest range guaranteed to fit in one column without overflowing. Reserves
// room for up to 2 lines of "Also:" text so a busy Anytime strip never pushes
// the grid past the bottom margin.
export const AGENDA_MAX_HOURS = Math.floor((CONTENT_H - HEADER_H - ANYTIME_LINE_H * 2) / (2 * SLOT_H));

const LABEL_W = 30; // hour-label gutter width
const LANE_GAP = 2; // px gap between side-by-side overlapping event blocks
const MIN_BLOCK_MIN = 30; // shortest a block ever renders, in minutes (keeps text legible)
const MARKER_DEFAULT_MIN = 30; // default block length for flights/hotels/transport (no real duration)
const ACTIVITY_DEFAULT_MIN = 60; // default block length for activities with no parseable duration

function clampHourRange(startHour?: number, endHour?: number): { startHour: number; endHour: number } {
  let start = Number.isInteger(startHour) ? (startHour as number) : AGENDA_DEFAULT_START_HOUR;
  start = Math.max(0, Math.min(23, start));
  let end = Number.isInteger(endHour) ? (endHour as number) : start + (AGENDA_DEFAULT_END_HOUR - AGENDA_DEFAULT_START_HOUR);
  end = Math.max(start + 1, Math.min(24, end));
  if (end - start > AGENDA_MAX_HOURS) end = start + AGENDA_MAX_HOURS;
  return { startHour: start, endHour: end };
}

function fmtHourLabel(hour: number): string {
  const h = hour % 24;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayHour = h % 12 || 12;
  return `${displayHour} ${ampm}`;
}

/** Minutes since midnight, or null if unparseable. */
function parseTimeMinutes(time: string | undefined): number | null {
  if (!time) return null;
  const [h, m] = time.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

/** Best-effort parse of free-text durations like "2 hours", "45 min", "1.5h". */
function parseDurationMinutes(duration: string | undefined): number | null {
  if (!duration) return null;
  const s = duration.toLowerCase();
  const hourMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/);
  if (hourMatch) return Math.round(parseFloat(hourMatch[1]) * 60);
  const minMatch = s.match(/(\d+)\s*(?:minutes?|mins?|m)\b/);
  if (minMatch) return parseInt(minMatch[1], 10);
  const hmMatch = s.match(/^(\d+):(\d{2})$/);
  if (hmMatch) return parseInt(hmMatch[1], 10) * 60 + parseInt(hmMatch[2], 10);
  return null;
}

// ─── Raw item extraction ───────────────────────────────────────────────────────

interface RawItem {
  time?: string;
  durationMinutes: number;
  color: string;
  title: string;
  details: string[];
}

function collectRawItems(events: TimelineEvent[], dayActivities: Activity[]): RawItem[] {
  const raw: RawItem[] = [];

  for (const e of events) {
    if (e.type === 'flight') {
      if (e.subtype === 'departure') {
        const f = e as FlightDepartureEvent;
        raw.push({
          time: f.time,
          durationMinutes: MARKER_DEFAULT_MIN,
          color: C.flightBlue,
          title: `Depart ${f.flightNo} · ${f.departureAirport} → ${f.arrivalAirport}`,
          details: [
            [f.bookingRef && `Ref: ${f.bookingRef}`, f.seatNumber && `Seat ${f.seatNumber}`, f.gate && `Gate ${f.gate}`]
              .filter(Boolean).join(' · '),
          ],
        });
      } else if (e.subtype === 'arrival') {
        const f = e as FlightArrivalEvent;
        raw.push({ time: f.time, durationMinutes: MARKER_DEFAULT_MIN, color: C.flightBlue, title: `Arrive ${f.flightNo} · ${f.arrivalAirport}`, details: [] });
      } else {
        const f = e as FlightConnectionEvent;
        raw.push({
          time: f.time,
          durationMinutes: f.layoverMinutes ?? MARKER_DEFAULT_MIN,
          color: C.flightBlue,
          title: `Connection · ${f.connectionAirport}`,
          details: [],
        });
      }
    } else if (e.type === 'hotel') {
      if (e.subtype === 'check_in') {
        const h = e as HotelCheckInEvent;
        raw.push({
          time: h.time,
          durationMinutes: MARKER_DEFAULT_MIN,
          color: C.hotelTerra,
          title: `Check in · ${h.hotelName}`,
          details: [h.locationAddress ?? '', h.bookingRef ? `Ref: ${h.bookingRef}` : ''],
        });
      } else {
        const h = e as HotelCheckOutEvent;
        raw.push({ time: h.time, durationMinutes: MARKER_DEFAULT_MIN, color: C.hotelTerra, title: `Check out · ${h.hotelName}`, details: [] });
      }
    } else if (e.type === 'otherTransportation') {
      const t = e as TransportDepartureEvent | TransportArrivalEvent;
      const typeName = t.transportType.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      const title = t.subtype === 'departure'
        ? `${typeName} · ${t.departureLocation} → ${t.arrivalLocation}`
        : `Arrive · ${t.arrivalLocation}`;
      raw.push({
        time: t.time,
        durationMinutes: MARKER_DEFAULT_MIN,
        color: C.flightBlue,
        title,
        details: [t.locationAddress ?? '', [t.vendor, t.bookingRef && `Ref: ${t.bookingRef}`].filter(Boolean).join(' · ')],
      });
    } else if (e.type === 'activity') {
      const a = e as ActivityEvent;
      raw.push({
        time: a.time,
        durationMinutes: parseDurationMinutes(a.duration) ?? ACTIVITY_DEFAULT_MIN,
        color: C.activityGreen,
        title: a.description,
        details: [a.cost ? fmtCost(a.cost) : '', a.locationAddress ?? '', a.bookingRef ? `Ref: ${a.bookingRef}` : ''],
      });
    }
  }

  for (const a of dayActivities) {
    raw.push({
      time: a.scheduledTime,
      durationMinutes: parseDurationMinutes(a.duration) ?? ACTIVITY_DEFAULT_MIN,
      color: C.activityGreen,
      title: a.name,
      details: [a.estimatedCost ?? '', a.address ?? ''],
    });
  }

  return raw;
}

// ─── Overlap layout (Outlook-style side-by-side lanes) ────────────────────────

interface TimedItem extends RawItem {
  startRel: number; // minutes from grid start
  endRel: number;
}

interface LaidOutItem extends TimedItem {
  lane: number;
  clusterLanes: number;
}

/** Greedy interval-graph coloring, scoped per overlap cluster so unrelated events keep full width. */
function layoutLanes(items: TimedItem[]): LaidOutItem[] {
  const sorted = [...items].sort((a, b) => a.startRel - b.startRel);
  const result: LaidOutItem[] = [];
  let clusterStart = 0;
  let clusterEndMax = -Infinity;
  let laneEnds: number[] = [];

  const flushCluster = (endIdx: number) => {
    const cluster = result.slice(clusterStart, endIdx);
    const maxLanes = cluster.length ? Math.max(...cluster.map((it) => it.lane)) + 1 : 1;
    for (const it of cluster) it.clusterLanes = maxLanes;
  };

  for (const item of sorted) {
    if (item.startRel >= clusterEndMax) {
      flushCluster(result.length);
      clusterStart = result.length;
      laneEnds = [];
      clusterEndMax = -Infinity;
    }
    let lane = laneEnds.findIndex((end) => end <= item.startRel);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.endRel);
    } else {
      laneEnds[lane] = item.endRel;
    }
    clusterEndMax = Math.max(clusterEndMax, item.endRel);
    result.push({ ...item, lane, clusterLanes: 1 });
  }
  flushCluster(result.length);

  return result;
}

// ─── Day column rendering (absolute-positioned) ────────────────────────────────

// All three event colors (flightBlue, hotelTerra, activityGreen) are dark enough for white text.
const EVENT_TEXT_COLOR = '#FFFFFF';

function agendaDayColumn(
  contentDay: ContentDay,
  x0: number,
  y0: number,
  colW: number,
  startHour: number,
  endHour: number,
): Content[] {
  const items: Content[] = [];
  const gridBottomMax = y0 + CONTENT_H;

  // ── Header ──────────────────────────────────────────────────────────────────
  const city = contentDay.events.find((e) => e.locationCity)?.locationCity ?? '';
  items.push({
    canvas: [{ type: 'rect', x: 0, y: 0, w: 3, h: HEADER_H - 4, color: C.yellow }],
    absolutePosition: { x: x0, y: y0 },
  } as unknown as Content);
  items.push({
    text: `Day ${contentDay.dayNumber}  ·  ${fmtDateMed(contentDay.day)}${city ? `  ·  ${city}` : ''}`,
    font: 'Times', fontSize: 11, bold: true, color: C.nearBlack,
    absolutePosition: { x: x0 + 10, y: y0 + 2 },
    width: colW - 10,
  } as unknown as Content);

  // ── Classify raw items into the timed grid vs. the "Other" strip ───────────
  const raw = collectRawItems(contentDay.events, contentDay.dayActivities);
  const gridStartMin = startHour * 60;
  const gridEndMin = endHour * 60;
  const totalGridMin = gridEndMin - gridStartMin;

  const timed: TimedItem[] = [];
  const other: { sortKey: number; label: string }[] = [];

  for (const item of raw) {
    const startMin = parseTimeMinutes(item.time);
    if (startMin === null || startMin < gridStartMin || startMin >= gridEndMin) {
      const timeLabel = item.time ? fmtTime(item.time) : '';
      other.push({ sortKey: startMin ?? -1, label: timeLabel ? `${timeLabel} — ${item.title}` : item.title });
      continue;
    }
    const startRel = startMin - gridStartMin;
    const durationClamped = Math.max(item.durationMinutes, MIN_BLOCK_MIN);
    const endRel = Math.min(startRel + durationClamped, totalGridMin);
    timed.push({ ...item, startRel, endRel });
  }
  other.sort((a, b) => a.sortKey - b.sortKey);

  // ── "Other" strip (untimed / outside the selected hours) ──────────────────
  let gridTop = y0 + HEADER_H;
  if (other.length > 0) {
    const text = 'Also: ' + other.map((o) => o.label).join('  ·  ');
    items.push({
      text,
      fontSize: 6.3,
      color: C.muted,
      absolutePosition: { x: x0, y: gridTop },
      width: colW,
      lineHeight: 1.1,
    } as unknown as Content);
    gridTop += ANYTIME_LINE_H;
  }

  // ── Grid geometry ───────────────────────────────────────────────────────────
  // Defensively clamp to whatever vertical room is actually left in this column
  // (normally the full requested range fits — this only bites if an unusually
  // long "Also:" line wrapped to extra lines) so the grid can never bleed past
  // the half-page it's confined to.
  const idealSlots = Math.round(totalGridMin / 30);
  const maxSlotsFit = Math.max(0, Math.floor((gridBottomMax - gridTop) / SLOT_H));
  const numSlots = Math.min(idealSlots, maxSlotsFit);
  const gridH = numSlots * SLOT_H;
  const gridBottom = gridTop + gridH;
  const eventAreaX = x0 + LABEL_W + 3;
  const eventAreaW = colW - LABEL_W - 6;
  // Hours actually rendered — normally equals (endHour - startHour), but if the
  // defensive clamp above kicked in, don't draw labels/shading past what fits.
  const numHoursRendered = Math.floor(numSlots / 2);

  // Zebra shading on alternate hours (full column width, behind everything else)
  for (let h = 0; h < numHoursRendered; h++) {
    if (h % 2 !== 0) continue;
    items.push({
      canvas: [{ type: 'rect', x: 0, y: 0, w: colW, h: SLOT_H * 2, color: C.surface }],
      absolutePosition: { x: x0, y: gridTop + h * 2 * SLOT_H },
    } as unknown as Content);
  }

  // Perimeter + half-hour rules + vertical divider
  items.push({
    canvas: [{ type: 'rect', x: 0, y: 0, w: colW, h: gridH, lineWidth: 0.75, lineColor: C.border }],
    absolutePosition: { x: x0, y: gridTop },
  } as unknown as Content);
  for (let slot = 1; slot < numSlots; slot++) {
    const isHour = slot % 2 === 0;
    items.push({
      canvas: [{ type: 'line', x1: 0, y1: 0, x2: colW, y2: 0, lineWidth: isHour ? 0.75 : 0.4, lineColor: C.border }],
      absolutePosition: { x: x0, y: gridTop + slot * SLOT_H },
    } as unknown as Content);
  }
  items.push({
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: 0, y2: gridH, lineWidth: 0.75, lineColor: C.border }],
    absolutePosition: { x: x0 + LABEL_W, y: gridTop },
  } as unknown as Content);

  // Hour labels, vertically centered in their 2-slot band
  for (let h = 0; h < numHoursRendered; h++) {
    items.push({
      text: fmtHourLabel(startHour + h),
      fontSize: 6.8,
      bold: true,
      color: C.nearBlack,
      absolutePosition: { x: x0 + 3, y: gridTop + h * 2 * SLOT_H + SLOT_H - 4 },
      width: LABEL_W - 5,
    } as unknown as Content);
  }

  // ── Event blocks, side-by-side within overlap clusters ─────────────────────
  const laidOut = layoutLanes(timed);
  const pxPerMin = SLOT_H / 30;
  for (const it of laidOut) {
    const laneW = (eventAreaW - LANE_GAP * (it.clusterLanes - 1)) / it.clusterLanes;
    const x = eventAreaX + it.lane * (laneW + LANE_GAP);
    const y = Math.min(gridTop + it.startRel * pxPerMin, gridBottom);
    const h = Math.min(gridTop + it.endRel * pxPerMin, gridBottom) - y;
    if (h <= 0) continue;

    items.push({
      canvas: [{ type: 'rect', x: 0, y: 0, w: laneW, h, r: 1.5, color: it.color }],
      absolutePosition: { x, y },
    } as unknown as Content);

    const timeLabel = it.time ? fmtTime(it.time) : '';
    items.push({
      text: timeLabel ? `${timeLabel}  ${it.title}` : it.title,
      fontSize: 6.6,
      bold: true,
      color: EVENT_TEXT_COLOR,
      absolutePosition: { x: x + 3, y: y + 1.5 },
      width: Math.max(laneW - 6, 4),
      lineHeight: 1.05,
    } as unknown as Content);

    const detail = it.details.filter(Boolean).join(' · ');
    if (detail && h >= 24) {
      items.push({
        text: detail,
        fontSize: 5.8,
        color: '#F3F4F6',
        absolutePosition: { x: x + 3, y: y + 10 },
        width: Math.max(laneW - 6, 4),
        lineHeight: 1.0,
      } as unknown as Content);
    }
  }

  return items;
}

// ─── Booklet imposition ────────────────────────────────────────────────────────
//
// Fold-and-staple booklet printing needs the physical sheets in "signature"
// order, not reading order: each landscape sheet holds 2 pages per side (4 per
// sheet once printed double-sided), and folding a whole stack of them together
// only reconstructs 1,2,3,4,... if the outermost sheet carries the first/last
// pages, the next sheet in carries the next pair in from both ends, and so on.
// This is the same imposition every "print as booklet" feature uses (Acrobat,
// Word, pdfbook, ...): for sheet k of S = N/4 (1 = outermost), N = total pages
// padded up to a multiple of 4 with trailing blanks:
//   front: [N - 2k + 2, 2k - 1]      back: [2k, N - 2k + 1]

function buildBookletPageSlots(numDays: number): Array<[number | null, number | null]> {
  const N = Math.max(4, Math.ceil(numDays / 4) * 4);
  const S = N / 4;
  const slot = (p: number): number | null => (p <= numDays ? p - 1 : null); // p is 1-indexed; null = blank padding page
  const pages: Array<[number | null, number | null]> = [];
  for (let k = 1; k <= S; k++) {
    pages.push([slot(N - 2 * k + 2), slot(2 * k - 1)]); // front
    pages.push([slot(2 * k), slot(N - 2 * k + 1)]); // back
  }
  return pages;
}

// ─── Render entry point ───────────────────────────────────────────────────────

export async function renderTripAgendaPdf(
  payload: TripExportPayload,
  opts?: { startHour?: number; endHour?: number; booklet?: boolean },
): Promise<Buffer> {
  const { startHour, endHour } = clampHourRange(opts?.startHour, opts?.endHour);
  const contentDays = buildContentDays(payload);

  const pageContentW = PAGE_W - MARGIN * 2;
  const dayColW = (pageContentW - COL_GAP) / 2;
  const leftX = MARGIN;
  const rightX = MARGIN + dayColW + COL_GAP;
  const y0 = MARGIN;

  const renderPage = (left: ContentDay | null, right: ContentDay | null): Content[] => [
    ...(left ? agendaDayColumn(left, leftX, y0, dayColW, startHour, endHour) : []),
    ...(right ? agendaDayColumn(right, rightX, y0, dayColW, startHour, endHour) : []),
  ];

  const items: Content[] = [];

  if (contentDays.length === 0) {
    items.push({ text: 'No scheduled days to display.', margin: [0, 60, 0, 0], alignment: 'center', color: C.muted } as Content);
  } else if (opts?.booklet) {
    const pageSlots = buildBookletPageSlots(contentDays.length);
    pageSlots.forEach(([leftIdx, rightIdx], pageIndex) => {
      const pageItems = renderPage(
        leftIdx !== null ? contentDays[leftIdx] : null,
        rightIdx !== null ? contentDays[rightIdx] : null,
      );
      if (pageIndex === 0) {
        items.push(...pageItems);
      } else {
        items.push(Object.assign({ text: '' } as object, { pageBreak: 'before' }) as Content);
        items.push(...pageItems);
      }
    });
  } else {
    for (let i = 0; i < contentDays.length; i += 2) {
      const pageItems = renderPage(contentDays[i], contentDays[i + 1] ?? null);
      if (i === 0) {
        items.push(...pageItems);
      } else {
        // Force a page break before this pair's first item; the rest are plain
        // absolute items and don't affect the flow cursor.
        items.push(Object.assign({ text: '' } as object, { pageBreak: 'before' }) as Content);
        items.push(...pageItems);
      }
    }
  }

  const printer = createPrinter();

  const docDefinition: TDocumentDefinitions = {
    pageSize: 'LETTER',
    pageOrientation: 'landscape',
    pageMargins: [MARGIN, MARGIN, MARGIN, MARGIN + FOOTER_EXTRA],
    info: {
      title: `${payload.trip.name} — Agenda`,
      author: 'TravelBuddy',
      subject: `${payload.trip.destination} — Daily Agenda`,
    },
    footer: (currentPage, pageCount) => ({
      margin: [MARGIN, 8, MARGIN, 0],
      columns: [
        { text: 'TravelBuddy', fontSize: 8, color: C.light },
        { text: `${payload.trip.name} — Agenda`, fontSize: 8, color: C.light, alignment: 'center' },
        { text: `${currentPage} / ${pageCount}`, fontSize: 8, color: C.light, alignment: 'right' },
      ],
    }),
    content: items,
    defaultStyle: {
      font: 'Helvetica',
      fontSize: 9,
      color: C.nearBlack,
      lineHeight: 1.2,
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
