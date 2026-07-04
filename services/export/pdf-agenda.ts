/**
 * Agenda PDF export — a printable day-planner view, adapted from Outlook-style
 * schedule editors for paper: landscape orientation, two "leaves" per physical
 * page (each confined to its own half — left/right columns), a ruled
 * half-hour grid with times down the side, and events drawn as colored blocks
 * stretching from start time to finish time. Overlapping events split into
 * side-by-side lanes instead of stacking, so a busy hour never grows taller
 * than a single row.
 *
 * The hour range (e.g. 8am–8pm) is chosen by the caller before generating.
 * The half-hour row height is *not* fixed — it's derived from the chosen
 * range so the grid always fills the available column height exactly,
 * whether that's a tight 8am–midnight or a spacious 9am–6pm.
 *
 * Page 1 is always a full-bleed cover — trip photo (or a yellow fallback),
 * trip name, destinations in the order the itinerary actually visits them,
 * and the date range — the same treatment as the trip binder's cover. It
 * stands alone rather than sharing a page with a leaf, so in booklet mode
 * it's meant to print separately as a wraparound cover sheet.
 *
 * The next two leaves are always a Quick Reference summary (flights, ground
 * transport, hotels), same idea as the trip binder's Quick Reference page.
 *
 * An optional "booklet" mode reorders the physical pages into saddle-stitch
 * signature order, so printing double-sided and folding the whole stack in
 * half along the vertical centerline (then stapling the spine) produces a
 * booklet that reads in the correct order — see buildBookletPageSlots.
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
import { createPrinter, C, COMPASS_SVG, fetchImage, fmtDateShort, fmtDateMed, fmtTime, fmtCost, buildContentDays } from './pdf-shared';

// US Letter, landscape (11in × 8.5in)
const PAGE_W = 792;
const PAGE_H = 612;
const MARGIN = 30;
const FOOTER_EXTRA = 18; // extra bottom margin reserved for the footer, beyond MARGIN
const COL_GAP = 22;

const CONTENT_H = PAGE_H - MARGIN * 2 - FOOTER_EXTRA;

const HEADER_H = 26; // leaf header block
// Always reserved (whether used or not) so the grid starts at the same fixed
// offset on every day, which in turn lets the half-hour row height be derived
// once for the whole document instead of guessed per-day.
const RESERVED_TOP_H = 24; // ~2 lines of "Also:" text

export const AGENDA_DEFAULT_START_HOUR = 8;
export const AGENDA_DEFAULT_END_HOUR = 20;

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

/** Rough estimate of how many lines `text` will wrap to at `fontSize` within `width` pt. */
function estimateLineCount(text: string, fontSize: number, width: number): number {
  if (!text) return 0;
  const avgCharW = fontSize * 0.52; // rough average glyph width for Helvetica at small sizes
  const charsPerLine = Math.max(1, Math.floor(width / avgCharW));
  return Math.max(1, Math.ceil(text.length / charsPerLine));
}

/**
 * Absolutely-positioned text that reliably wraps at `width`. A plain
 * `{ text, width, absolutePosition }` node is not dependable — pdfmake sizes
 * absolutely-positioned text against the surrounding flow's available width,
 * not the given `width`, so long strings can run straight past their lane
 * instead of wrapping. Wrapping the text in a single fixed-width table cell
 * (the same technique eventCard/miniCard already use) forces the wrap point.
 */
function absText(
  x: number,
  y: number,
  width: number,
  opts: { text: string; fontSize: number; bold?: boolean; italics?: boolean; color?: string; lineHeight?: number; font?: string },
): Content {
  return {
    table: {
      widths: [width],
      body: [[{
        text: opts.text,
        fontSize: opts.fontSize,
        bold: opts.bold,
        italics: opts.italics,
        color: opts.color,
        lineHeight: opts.lineHeight,
        font: opts.font,
      }]],
    },
    layout: {
      defaultBorder: false,
      paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
    },
    absolutePosition: { x, y },
  } as unknown as Content;
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
  slotH: number,
): Content[] {
  const items: Content[] = [];

  // ── Header ──────────────────────────────────────────────────────────────────
  const city = contentDay.events.find((e) => e.locationCity)?.locationCity ?? '';
  items.push({
    canvas: [{ type: 'rect', x: 0, y: 0, w: 3, h: HEADER_H - 4, color: C.yellow }],
    absolutePosition: { x: x0, y: y0 },
  } as unknown as Content);
  items.push(absText(x0 + 10, y0 + 2, colW - 10, {
    text: `Day ${contentDay.dayNumber}  ·  ${fmtDateMed(contentDay.day)}${city ? `  ·  ${city}` : ''}`,
    font: 'Times', fontSize: 11, bold: true, color: C.nearBlack,
  }));

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

  // ── "Other" strip (untimed / outside the selected hours) — always rendered
  // into the same reserved band, whether it has content or not, so the grid
  // below always starts at the same fixed offset regardless of this day's content.
  if (other.length > 0) {
    items.push(absText(x0, y0 + HEADER_H, colW, {
      text: 'Also: ' + other.map((o) => o.label).join('  ·  '),
      fontSize: 6.3,
      color: C.muted,
      lineHeight: 1.1,
    }));
  }

  // ── Grid geometry — slotH is derived from the chosen hour range so the grid
  // always fills exactly the space between the header and the footer margin,
  // whether that's 24 half-hour slots (8am-8pm) or 32 (8am-midnight).
  const gridTop = y0 + HEADER_H + RESERVED_TOP_H;
  const numSlots = (endHour - startHour) * 2;
  const gridH = numSlots * slotH;
  const eventAreaX = x0 + LABEL_W + 3;
  const eventAreaW = colW - LABEL_W - 6;
  const numHours = endHour - startHour;

  // Zebra shading on alternate hours (full column width, behind everything else)
  for (let h = 0; h < numHours; h++) {
    if (h % 2 !== 0) continue;
    items.push({
      canvas: [{ type: 'rect', x: 0, y: 0, w: colW, h: slotH * 2, color: C.surface }],
      absolutePosition: { x: x0, y: gridTop + h * 2 * slotH },
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
      absolutePosition: { x: x0, y: gridTop + slot * slotH },
    } as unknown as Content);
  }
  items.push({
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: 0, y2: gridH, lineWidth: 0.75, lineColor: C.border }],
    absolutePosition: { x: x0 + LABEL_W, y: gridTop },
  } as unknown as Content);

  // Hour labels, vertically centered in their 2-slot band
  for (let h = 0; h < numHours; h++) {
    items.push(absText(x0 + 3, gridTop + h * 2 * slotH + slotH - 4, LABEL_W - 5, {
      text: fmtHourLabel(startHour + h),
      fontSize: 6.8,
      bold: true,
      color: C.nearBlack,
    }));
  }

  // ── Event blocks, side-by-side within overlap clusters ─────────────────────
  const laidOut = layoutLanes(timed);
  const pxPerMin = slotH / 30;
  for (const it of laidOut) {
    const laneW = (eventAreaW - LANE_GAP * (it.clusterLanes - 1)) / it.clusterLanes;
    const x = eventAreaX + it.lane * (laneW + LANE_GAP);
    const y = gridTop + it.startRel * pxPerMin;
    const h = gridTop + it.endRel * pxPerMin - y;
    if (h <= 0) continue;

    items.push({
      canvas: [{ type: 'rect', x: 0, y: 0, w: laneW, h, r: 1.5, color: it.color }],
      absolutePosition: { x, y },
    } as unknown as Content);

    const textW = Math.max(laneW - 6, 4);
    const timeLabel = it.time ? fmtTime(it.time) : '';
    const titleStr = timeLabel ? `${timeLabel}  ${it.title}` : it.title;
    const titleFontSize = 6.6;
    const titleLineH = titleFontSize * 1.05;
    const titleBlockH = estimateLineCount(titleStr, titleFontSize, textW) * titleLineH;

    items.push(absText(x + 3, y + 1.5, textW, {
      text: titleStr,
      fontSize: titleFontSize,
      bold: true,
      color: EVENT_TEXT_COLOR,
      lineHeight: 1.05,
    }));

    // Fit as many wrapped detail lines as the block's actual height allows —
    // a 30-minute block shows nothing extra, a 3-hour one can show them all.
    let cursorY = y + 1.5 + titleBlockH + 1.5;
    const detailFontSize = 5.8;
    const detailLineH = detailFontSize * 1.15;
    for (const detail of it.details.filter(Boolean)) {
      const neededH = estimateLineCount(detail, detailFontSize, textW) * detailLineH;
      if (cursorY + neededH > y + h - 1) break;
      items.push(absText(x + 3, cursorY, textW, {
        text: detail,
        fontSize: detailFontSize,
        color: '#F3F4F6',
        lineHeight: 1.15,
      }));
      cursorY += neededH;
    }
  }

  return items;
}

// ─── Quick Reference leaves (flights / ground transport / hotels) ─────────────
// Mirrors the trip binder's Quick Reference page, sized to a single half-page
// leaf. Rows are capped so the leaf's height is predictable — required for
// booklet mode, where every leaf must be exactly one signature slot.

function staticCard(x: number, y: number, width: number, color: string, title: string, detail: string): { items: Content[]; height: number } {
  const titleFontSize = 7;
  const detailFontSize = 6.2;
  const textW = width - 8;
  const titleH = estimateLineCount(title, titleFontSize, textW) * titleFontSize * 1.15;
  const hasDetail = !!detail;
  const detailH = hasDetail ? estimateLineCount(detail, detailFontSize, textW) * detailFontSize * 1.15 : 0;
  const pad = 3;
  const totalH = pad * 2 + titleH + (hasDetail ? 2 + detailH : 0);

  const items: Content[] = [
    { canvas: [{ type: 'rect', x: 0, y: 0, w: 2.5, h: totalH, color }], absolutePosition: { x, y } } as unknown as Content,
    absText(x + 7, y + pad, textW, { text: title, fontSize: titleFontSize, bold: true, color: C.nearBlack, lineHeight: 1.15 }),
    ...(hasDetail ? [absText(x + 7, y + pad + titleH + 2, textW, { text: detail, fontSize: detailFontSize, color: C.muted, lineHeight: 1.15 })] : []),
  ];
  return { items, height: totalH + 5 };
}

function leafHeader(x0: number, y0: number, colW: number, title: string, subtitle: string): Content[] {
  return [
    { canvas: [{ type: 'rect', x: 0, y: 0, w: 3, h: HEADER_H - 4, color: C.yellow }], absolutePosition: { x: x0, y: y0 } } as unknown as Content,
    absText(x0 + 10, y0 + 1, colW - 10, { text: title, font: 'Times', fontSize: 12, bold: true, color: C.nearBlack }),
    absText(x0 + 10, y0 + 15, colW - 10, { text: subtitle, fontSize: 7.5, color: C.muted }),
  ];
}

function quickRefFlightsLeaf(payload: TripExportPayload, x0: number, y0: number, colW: number): Content[] {
  const { trip, timeline } = payload;
  const byDate = (a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date);
  const flights = timeline.filter((e): e is FlightDepartureEvent => e.type === 'flight' && e.subtype === 'departure').sort(byDate);
  const transports = timeline.filter((e): e is TransportDepartureEvent => e.type === 'otherTransportation' && e.subtype === 'departure').sort(byDate);

  const items: Content[] = leafHeader(x0, y0, colW, 'Quick Reference', trip.name);
  const bottomLimit = y0 + CONTENT_H;
  let y = y0 + HEADER_H + 8;

  const addSection = (label: string, rows: { color: string; title: string; detail: string }[]) => {
    if (y + 10 > bottomLimit) return;
    items.push(absText(x0, y, colW, { text: label, fontSize: 6.5, bold: true, color: C.muted }));
    y += 10;
    let shown = 0;
    for (const row of rows) {
      const { items: cardItems, height } = staticCard(x0, y, colW, row.color, row.title, row.detail);
      if (y + height > bottomLimit - 10) break;
      items.push(...cardItems);
      y += height;
      shown++;
    }
    if (shown < rows.length) {
      items.push(absText(x0, y, colW, { text: `+${rows.length - shown} more — see full itinerary`, fontSize: 6, italics: true, color: C.muted }));
      y += 9;
    }
    y += 6;
  };

  addSection('FLIGHTS', flights.map((f) => ({
    color: C.flightBlue,
    title: `${fmtDateShort(f.date)} · ${f.flightNo} · ${f.departureAirport} → ${f.arrivalAirport}${f.time ? ' ' + fmtTime(f.time) : ''}`,
    detail: [f.bookingRef && `Ref: ${f.bookingRef}`, f.seatNumber && `Seat ${f.seatNumber}`].filter(Boolean).join(' · '),
  })));

  addSection('GROUND & WATER TRANSPORT', transports.map((t) => ({
    color: C.flightBlue,
    title: `${fmtDateShort(t.date)} · ${t.transportType.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())} · ${t.departureLocation} → ${t.arrivalLocation}`,
    detail: [t.vendor, t.bookingRef && `Ref: ${t.bookingRef}`].filter(Boolean).join(' · '),
  })));

  return items;
}

function quickRefHotelsLeaf(payload: TripExportPayload, x0: number, y0: number, colW: number): Content[] {
  const { trip, timeline } = payload;
  const hotels = timeline
    .filter((e): e is HotelCheckInEvent => e.type === 'hotel' && e.subtype === 'check_in')
    .sort((a, b) => a.date.localeCompare(b.date));

  const items: Content[] = leafHeader(x0, y0, colW, 'Accommodation', trip.destination);
  const bottomLimit = y0 + CONTENT_H;
  let y = y0 + HEADER_H + 8;

  let shown = 0;
  for (const h of hotels) {
    const nights = h.numberOfNights ? ` · ${h.numberOfNights} night${h.numberOfNights !== 1 ? 's' : ''}` : '';
    const title = `${h.hotelName}${nights}`;
    const detail = [h.locationCity, `${fmtDateShort(h.date)} – ${fmtDateShort(h.checkoutDate)}`, h.bookingRef && `Ref: ${h.bookingRef}`]
      .filter(Boolean).join(' · ');
    const { items: cardItems, height } = staticCard(x0, y, colW, C.hotelTerra, title, detail);
    if (y + height > bottomLimit - 10) break;
    items.push(...cardItems);
    y += height;
    shown++;
  }
  if (shown < hotels.length) {
    items.push(absText(x0, y, colW, { text: `+${hotels.length - shown} more — see full itinerary`, fontSize: 6, italics: true, color: C.muted }));
  }

  return items;
}

// ─── Cover page ─────────────────────────────────────────────────────────────────
// Same idea as the trip binder's cover: full-bleed photo, dark overlay, trip
// name + destinations + dates typeset over it. Always page 1 of the document,
// full-width (not split into leaves), regardless of booklet mode — in booklet
// mode it prints separately as a standalone wraparound cover.

/** Cities visited, in the order the itinerary actually visits them (not however trip.destinations happens to be stored). */
function chronologicalDestinations(contentDays: ContentDay[]): string[] {
  const cities: string[] = [];
  for (const day of contentDays) {
    const city = day.events.find((e) => e.locationCity)?.locationCity;
    if (city && cities[cities.length - 1] !== city) cities.push(city);
  }
  return cities;
}

function renderCoverPage(payload: TripExportPayload, contentDays: ContentDay[], hasCoverImage: boolean): Content[] {
  const { trip } = payload;

  const dateRange = (() => {
    if (!trip.startDate && !trip.endDate) return '';
    const fmt = (d: string) =>
      new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    if (trip.startDate && trip.endDate && trip.startDate !== trip.endDate)
      return `${fmt(trip.startDate)} – ${fmt(trip.endDate)}`;
    return fmt((trip.startDate ?? trip.endDate)!);
  })();

  const chronoDests = chronologicalDestinations(contentDays);
  const destinations = chronoDests.length > 1 ? chronoDests.join(' · ') : (chronoDests[0] ?? trip.destination);

  const textColor = hasCoverImage ? C.white : C.nearBlack;
  const subColor = hasCoverImage ? '#E5E7EB' : C.muted;

  return [
    // TravelBuddy wordmark badge — pill + compass + text, top-left
    { canvas: [{ type: 'rect', x: 0, y: 0, w: 116, h: 24, r: 12, color: C.yellow }], absolutePosition: { x: MARGIN, y: 16 } } as unknown as Content,
    { svg: COMPASS_SVG, width: 14, height: 14, absolutePosition: { x: MARGIN + 7, y: 21 } } as unknown as Content,
    absText(MARGIN + 26, 24, 90, { text: 'TravelBuddy', font: 'Times', fontSize: 12, bold: true, color: C.nearBlack }),

    // Trip name — big serif anchored a fixed distance above the bottom edge
    absText(MARGIN, PAGE_H - 150, PAGE_W - MARGIN * 2 - 40, {
      text: trip.name, font: 'Times', fontSize: 36, bold: true, color: textColor, lineHeight: 1.1,
    }),
    // Destinations, in the order actually visited
    ...(destinations ? [absText(MARGIN, PAGE_H - 95, PAGE_W - MARGIN * 2, { text: destinations, fontSize: 14, color: subColor })] : []),
    // Date range
    ...(dateRange ? [absText(MARGIN, PAGE_H - 50, PAGE_W - MARGIN * 2, { text: dateRange, fontSize: 11, color: hasCoverImage ? '#9CA3AF' : C.muted })] : []),
  ];
}

// ─── Booklet imposition ────────────────────────────────────────────────────────
//
// Fold-and-staple booklet printing needs the physical sheets in "signature"
// order, not reading order: each landscape sheet holds 2 leaves per side (4
// per sheet once printed double-sided), and folding a whole stack of them
// together only reconstructs 1,2,3,4,... if the outermost sheet carries the
// first/last leaves, the next sheet in carries the next pair in from both
// ends, and so on. This is the same imposition every "print as booklet"
// feature uses (Acrobat, Word, pdfbook, ...): for sheet k of S = N/4
// (1 = outermost), N = total leaves padded up to a multiple of 4 with
// trailing blanks:
//   front: [N - 2k + 2, 2k - 1]      back: [2k, N - 2k + 1]

function buildBookletPageSlots(numLeaves: number): Array<[number | null, number | null]> {
  const N = Math.max(4, Math.ceil(numLeaves / 4) * 4);
  const S = N / 4;
  const slot = (p: number): number | null => (p <= numLeaves ? p - 1 : null); // p is 1-indexed; null = blank padding leaf
  const pages: Array<[number | null, number | null]> = [];
  for (let k = 1; k <= S; k++) {
    pages.push([slot(N - 2 * k + 2), slot(2 * k - 1)]); // front
    pages.push([slot(2 * k), slot(N - 2 * k + 1)]); // back
  }
  return pages;
}

// ─── Render entry point ───────────────────────────────────────────────────────

type Leaf =
  | { kind: 'quickRefFlights' }
  | { kind: 'quickRefHotels' }
  | { kind: 'day'; day: ContentDay };

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

  // Half-hour row height derived from the chosen range so the grid always
  // fills the column exactly — a 12-hour range gets taller rows than a
  // 16-hour one, but neither leaves dead space or overflows the page.
  const availableGridH = CONTENT_H - HEADER_H - RESERVED_TOP_H;
  const slotH = availableGridH / ((endHour - startHour) * 2);

  const renderLeaf = (leaf: Leaf | null, x0Pos: number): Content[] => {
    if (!leaf) return [];
    if (leaf.kind === 'quickRefFlights') return quickRefFlightsLeaf(payload, x0Pos, y0, dayColW);
    if (leaf.kind === 'quickRefHotels') return quickRefHotelsLeaf(payload, x0Pos, y0, dayColW);
    return agendaDayColumn(leaf.day, x0Pos, y0, dayColW, startHour, endHour, slotH);
  };
  const renderPage = (left: Leaf | null, right: Leaf | null): Content[] => [
    ...renderLeaf(left, leftX),
    ...renderLeaf(right, rightX),
  ];

  // Cover is always page 1 — a standalone full-bleed page, not split into leaves.
  // In booklet mode it's meant to print separately as a wraparound cover sheet.
  const coverImageData = payload.trip.coverPhotoUrl
    ? await fetchImage(payload.trip.coverPhotoUrl, 'agenda cover photo')
    : null;

  const items: Content[] = renderCoverPage(payload, contentDays, !!coverImageData);
  items.push(Object.assign({ text: '' } as object, { pageBreak: 'before' }) as Content);

  if (contentDays.length === 0) {
    items.push({ text: 'No scheduled days to display.', margin: [0, 60, 0, 0], alignment: 'center', color: C.muted } as Content);
  } else {
    const leaves: Leaf[] = [
      { kind: 'quickRefFlights' },
      { kind: 'quickRefHotels' },
      ...contentDays.map((day): Leaf => ({ kind: 'day', day })),
    ];

    if (opts?.booklet) {
      const pageSlots = buildBookletPageSlots(leaves.length);
      pageSlots.forEach(([li, ri], pageIndex) => {
        const pageItems = renderPage(li !== null ? leaves[li] : null, ri !== null ? leaves[ri] : null);
        if (pageIndex > 0) items.push(Object.assign({ text: '' } as object, { pageBreak: 'before' }) as Content);
        items.push(...pageItems);
      });
    } else {
      for (let i = 0; i < leaves.length; i += 2) {
        const pageItems = renderPage(leaves[i], leaves[i + 1] ?? null);
        if (i > 0) items.push(Object.assign({ text: '' } as object, { pageBreak: 'before' }) as Content);
        items.push(...pageItems);
      }
    }
  }

  const printer = createPrinter();
  const images: Record<string, string> = {};
  if (coverImageData) images.cover = coverImageData;

  const docDefinition: TDocumentDefinitions = {
    pageSize: 'LETTER',
    pageOrientation: 'landscape',
    pageMargins: [MARGIN, MARGIN, MARGIN, MARGIN + FOOTER_EXTRA],
    info: {
      title: `${payload.trip.name} — Agenda`,
      author: 'TravelBuddy',
      subject: `${payload.trip.destination} — Daily Agenda`,
    },
    images,
    // Cover page background: full-bleed photo (or yellow fallback) + dark overlay + yellow top bar
    background: (currentPage, pageSize) => {
      if (currentPage !== 1) return null;
      const bgItems: Content[] = [];
      if (coverImageData) {
        bgItems.push({ image: 'cover', width: pageSize.width, height: pageSize.height, absolutePosition: { x: 0, y: 0 } } as unknown as Content);
        bgItems.push({
          canvas: [{ type: 'rect', x: 0, y: 0, w: pageSize.width, h: pageSize.height, color: '#000000', fillOpacity: 0.55 }],
          absolutePosition: { x: 0, y: 0 },
        } as unknown as Content);
      } else {
        bgItems.push({
          canvas: [{ type: 'rect', x: 0, y: 0, w: pageSize.width, h: pageSize.height, color: '#FACC15' }],
          absolutePosition: { x: 0, y: 0 },
        } as unknown as Content);
      }
      bgItems.push({
        canvas: [{ type: 'rect', x: 0, y: 0, w: pageSize.width, h: 5, color: C.yellow }],
        absolutePosition: { x: 0, y: 0 },
      } as unknown as Content);
      return bgItems;
    },
    // Footer — skip on the cover page
    footer: (currentPage, pageCount) => {
      if (currentPage === 1) return null;
      return {
        margin: [MARGIN, 8, MARGIN, 0],
        columns: [
          { text: 'TravelBuddy', fontSize: 8, color: C.light },
          { text: `${payload.trip.name} — Agenda`, fontSize: 8, color: C.light, alignment: 'center' },
          { text: `${currentPage} / ${pageCount}`, fontSize: 8, color: C.light, alignment: 'right' },
        ],
      };
    },
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
