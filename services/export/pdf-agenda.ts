/**
 * Agenda PDF export — a printable day-planner view, adapted from Outlook-style
 * schedule editors for paper: landscape orientation, two days per page, an
 * hour-by-hour ruled grid with times down the side, and blank ruled space for
 * hours with nothing booked (so it doubles as a notebook page).
 *
 * The displayed hour range is fixed at 8 AM–8 PM unless something in the trip
 * is scheduled at or after 8 PM, in which case the whole document switches to
 * 8 AM–midnight so every event has a row. Events with no time (or a time
 * before 8 AM) land in an "Anytime" row at the top of each day.
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
const PAGE_H = 612;
const MARGIN = 30;
const FOOTER_EXTRA = 18; // extra bottom margin reserved for the footer, beyond MARGIN
const COL_GAP = 22;

const CONTENT_H = PAGE_H - MARGIN * 2 - FOOTER_EXTRA;

const HEADER_RESERVED = 32; // day header block, incl. bottom margin
const GRID_H = CONTENT_H - HEADER_RESERVED;

const AGENDA_START_HOUR = 8;
const ANYTIME_WEIGHT = 1.6; // the "Anytime" row gets more room than a single hour row

const LABEL_W = 34;

/** All timed items get a row within [8am, endHour). Everything else scans the trip for a hint. */
function computeAgendaEndHour(payload: TripExportPayload): 20 | 24 {
  let maxHour = -1;
  for (const e of payload.timeline) {
    if (e.type === 'expense' || !e.time) continue;
    const h = Number(e.time.split(':')[0]);
    if (!Number.isNaN(h)) maxHour = Math.max(maxHour, h);
  }
  for (const a of payload.activities) {
    if (!a.scheduledDate || !a.scheduledTime) continue;
    const h = Number(a.scheduledTime.split(':')[0]);
    if (!Number.isNaN(h)) maxHour = Math.max(maxHour, h);
  }
  return maxHour >= 20 ? 24 : 20;
}

function fmtHourLabel(hour: number): string {
  const h = hour % 24;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayHour = h % 12 || 12;
  return `${displayHour} ${ampm}`;
}

function parseHour(time: string | undefined): number | null {
  if (!time) return null;
  const h = Number(time.split(':')[0]);
  return Number.isNaN(h) ? null : h;
}

// ─── Compact time-slot card ────────────────────────────────────────────────────

function miniCard(accentColor: string, timeLabel: string, title: string, details: string[]): Content {
  const filtered = details.filter(Boolean);
  return {
    table: {
      widths: [2, '*'],
      body: [[
        { border: [false, false, false, false], fillColor: accentColor, text: '' },
        {
          border: [false, false, false, false],
          stack: [
            {
              text: timeLabel ? `${timeLabel}  ·  ${title}` : title,
              fontSize: 7.3,
              bold: true,
              color: C.nearBlack,
              margin: [0, 0, 0, filtered.length ? 1 : 0],
            },
            ...filtered.map((d) => ({ text: d, fontSize: 6.3, color: C.muted, lineHeight: 1.15 })),
          ],
          margin: [4, 1, 2, 1],
        },
      ]],
    },
    layout: {
      defaultBorder: false,
      paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
    },
    margin: [0, 0, 0, 2],
  } as unknown as Content;
}

// ─── Raw item extraction ───────────────────────────────────────────────────────

interface RawItem {
  time?: string;
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
          color: C.flightBlue,
          title: `Depart ${f.flightNo} · ${f.departureAirport} → ${f.arrivalAirport}`,
          details: [
            [f.bookingRef && `Ref: ${f.bookingRef}`, f.seatNumber && `Seat ${f.seatNumber}`, f.gate && `Gate ${f.gate}`]
              .filter(Boolean).join(' · '),
          ],
        });
      } else if (e.subtype === 'arrival') {
        const f = e as FlightArrivalEvent;
        raw.push({ time: f.time, color: C.flightBlue, title: `Arrive ${f.flightNo} · ${f.arrivalAirport}`, details: [] });
      } else {
        const f = e as FlightConnectionEvent;
        raw.push({
          time: f.time,
          color: C.flightBlue,
          title: `Connection · ${f.connectionAirport}`,
          details: [f.layoverMinutes ? `${Math.floor(f.layoverMinutes / 60)}h ${f.layoverMinutes % 60}m layover` : ''],
        });
      }
    } else if (e.type === 'hotel') {
      if (e.subtype === 'check_in') {
        const h = e as HotelCheckInEvent;
        raw.push({
          time: h.time,
          color: C.hotelTerra,
          title: `Check in · ${h.hotelName}`,
          details: [h.locationAddress ?? '', h.bookingRef ? `Ref: ${h.bookingRef}` : ''],
        });
      } else {
        const h = e as HotelCheckOutEvent;
        raw.push({ time: h.time, color: C.hotelTerra, title: `Check out · ${h.hotelName}`, details: [] });
      }
    } else if (e.type === 'otherTransportation') {
      const t = e as TransportDepartureEvent | TransportArrivalEvent;
      const typeName = t.transportType.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      const title = t.subtype === 'departure'
        ? `${typeName} · ${t.departureLocation} → ${t.arrivalLocation}`
        : `Arrive · ${t.arrivalLocation}`;
      raw.push({
        time: t.time,
        color: C.flightBlue,
        title,
        details: [t.locationAddress ?? '', [t.vendor, t.bookingRef && `Ref: ${t.bookingRef}`].filter(Boolean).join(' · ')],
      });
    } else if (e.type === 'activity') {
      const a = e as ActivityEvent;
      raw.push({
        time: a.time,
        color: C.activityGreen,
        title: a.description,
        details: [
          [a.duration, a.cost ? fmtCost(a.cost) : ''].filter(Boolean).join(' · '),
          a.locationAddress ?? '',
        ],
      });
    }
  }

  for (const a of dayActivities) {
    raw.push({
      time: a.scheduledTime,
      color: C.activityGreen,
      title: a.name,
      details: [a.duration ?? '', a.address ?? ''],
    });
  }

  return raw;
}

/** Buckets a day's raw items into the "Anytime" row and per-hour rows. */
function bucketItems(
  raw: RawItem[],
  startHour: number,
  endHour: number,
): { anytime: Content[]; byHour: Map<number, Content[]> } {
  const anytimeSorted: { sortKey: number; card: Content }[] = [];
  const byHourSorted = new Map<number, { sortKey: number; card: Content }[]>();

  for (const item of raw) {
    const hour = parseHour(item.time);
    const timeLabel = item.time ? fmtTime(item.time) : '';
    const card = miniCard(item.color, timeLabel, item.title, item.details);

    if (hour === null || hour < startHour) {
      anytimeSorted.push({ sortKey: hour === null ? -1 : hour * 60, card });
      continue;
    }
    const bucketHour = Math.min(hour, endHour - 1);
    const minute = Number(item.time?.split(':')[1]) || 0;
    const arr = byHourSorted.get(bucketHour) ?? [];
    arr.push({ sortKey: hour * 60 + minute, card });
    byHourSorted.set(bucketHour, arr);
  }

  anytimeSorted.sort((a, b) => a.sortKey - b.sortKey);
  const byHour = new Map<number, Content[]>();
  for (const [hour, items] of byHourSorted) {
    items.sort((a, b) => a.sortKey - b.sortKey);
    byHour.set(hour, items.map((i) => i.card));
  }

  return { anytime: anytimeSorted.map((i) => i.card), byHour };
}

// ─── Day column ────────────────────────────────────────────────────────────────

function agendaDayHeader(contentDay: ContentDay): Content {
  const city = contentDay.events.find((e) => e.locationCity)?.locationCity ?? '';
  return {
    table: {
      widths: [3, '*'],
      body: [[
        { border: [false, false, false, false], fillColor: C.yellow, text: '' },
        {
          border: [false, false, false, false],
          fillColor: C.surface,
          stack: [
            { text: `Day ${contentDay.dayNumber}  ·  ${fmtDateMed(contentDay.day)}`, font: 'Times', fontSize: 12, bold: true, color: C.nearBlack, margin: [0, 0, 0, city ? 1 : 0] },
            ...(city ? [{ text: city, fontSize: 8, color: C.muted }] : []),
          ],
          margin: [8, 5, 8, 5],
        },
      ]],
    },
    layout: { defaultBorder: false, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 },
    margin: [0, 0, 0, 8],
  } as unknown as Content;
}

function buildHourTable(
  startHour: number,
  endHour: number,
  anytime: Content[],
  byHour: Map<number, Content[]>,
  anytimeRowH: number,
  hourRowH: number,
): Content {
  const hours: number[] = [];
  for (let h = startHour; h < endHour; h++) hours.push(h);

  const body: Content[][] = [
    [
      { text: 'ANYTIME', fontSize: 6.5, bold: true, color: C.muted, margin: [4, 4, 2, 0] },
      { stack: anytime, margin: [4, 3, 4, 3] },
    ],
    ...hours.map((h) => [
      { text: fmtHourLabel(h), fontSize: 7.5, bold: true, color: C.nearBlack, margin: [4, 4, 2, 0] },
      { stack: byHour.get(h) ?? [], margin: [4, 3, 4, 3] },
    ]),
  ];

  const heights = [anytimeRowH, ...hours.map(() => hourRowH)];

  return {
    table: { widths: [LABEL_W, '*'], heights, body },
    layout: {
      hLineWidth: (i: number) => (i <= 1 ? 1 : 0.5),
      hLineColor: (i: number) => (i <= 1 ? C.nearBlack : C.border),
      vLineWidth: (i: number) => (i === 1 ? 0.75 : 0),
      vLineColor: () => C.border,
      fillColor: (i: number) => (i === 0 ? '#FEF9E7' : i % 2 === 0 ? C.surface : null),
      paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
    },
  } as unknown as Content;
}

function buildAgendaDayColumn(
  contentDay: ContentDay,
  startHour: number,
  endHour: number,
  anytimeRowH: number,
  hourRowH: number,
): Content {
  const raw = collectRawItems(contentDay.events, contentDay.dayActivities);
  const { anytime, byHour } = bucketItems(raw, startHour, endHour);
  const table = buildHourTable(startHour, endHour, anytime, byHour, anytimeRowH, hourRowH);
  return { stack: [agendaDayHeader(contentDay), table] };
}

// ─── Render entry point ───────────────────────────────────────────────────────

export async function renderTripAgendaPdf(payload: TripExportPayload): Promise<Buffer> {
  const contentDays = buildContentDays(payload);
  const startHour = AGENDA_START_HOUR;
  const endHour = computeAgendaEndHour(payload);

  const totalHourRows = endHour - startHour;
  const unit = GRID_H / (ANYTIME_WEIGHT + totalHourRows);
  const hourRowH = Math.floor(unit);
  const anytimeRowH = Math.floor(unit * ANYTIME_WEIGHT);

  const items: Content[] = [];

  if (contentDays.length === 0) {
    items.push({ text: 'No scheduled days to display.', margin: [0, 60, 0, 0], alignment: 'center', color: C.muted } as Content);
  }

  for (let i = 0; i < contentDays.length; i += 2) {
    const a = contentDays[i];
    const b = contentDays[i + 1];
    const colA = buildAgendaDayColumn(a, startHour, endHour, anytimeRowH, hourRowH);
    const colB = b ? buildAgendaDayColumn(b, startHour, endHour, anytimeRowH, hourRowH) : ({ text: '' } as Content);

    const pair: Content = {
      columns: [
        { width: '*', stack: [colA] },
        { width: COL_GAP, text: '' },
        { width: '*', stack: [colB] },
      ],
    } as unknown as Content;

    if (i === 0) items.push(pair);
    else items.push(Object.assign(pair as object, { pageBreak: 'before' }) as Content);
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
