/**
 * Shared pdfmake plumbing + formatting helpers used by every PDF export variant
 * (trip binder, agenda). Keeping this in one place avoids each variant re-declaring
 * its own font registry / printer bootstrap / date-time formatters.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
export type Content = import('pdfmake/interfaces').Content;
// eslint-disable-next-line @typescript-eslint/no-require-imports
export type TDocumentDefinitions = import('pdfmake/interfaces').TDocumentDefinitions;

import type { TripExportPayload } from './json';
import type { TimelineEvent, Activity, Cost } from '@/types';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PdfPrinter = require('pdfmake/js/Printer').default as {
  new (fonts: Record<string, unknown>, vfs?: unknown, urlResolver?: unknown): {
    createPdfKitDocument(dd: TDocumentDefinitions, options?: Record<string, unknown>): Promise<NodeJS.ReadableStream & { end(): void }>;
  };
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const vfsInstance = require('pdfmake/js/virtual-fs').default as unknown;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const URLResolver = require('pdfmake/js/URLResolver').default as { new (vfs: unknown): unknown };

// ─── Fonts ────────────────────────────────────────────────────────────────────

export const FONTS = {
  Helvetica: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique',
  },
  Times: {
    normal: 'Times-Roman',
    bold: 'Times-Bold',
    italics: 'Times-Italic',
    bolditalics: 'Times-BoldItalic',
  },
};

/** Fresh printer instance — a new URLResolver is required per document. */
export function createPrinter() {
  const urlResolver = new URLResolver(vfsInstance);
  return new PdfPrinter(FONTS, vfsInstance, urlResolver);
}

// ─── Design tokens ────────────────────────────────────────────────────────────

export const C = {
  yellow: '#FACC15',
  nearBlack: '#111827',
  muted: '#6B7280',
  light: '#9CA3AF',
  border: '#E5E7EB',
  surface: '#F3F4F6',
  white: '#FFFFFF',
  flightBlue: '#1D4ED8',
  hotelTerra: '#E07B39',
  activityGreen: '#2D6A4F',
  red: '#DC2626',
} as const;

// Lucide Compass SVG (used in the cover-page wordmark badge)
export const COMPASS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#111827" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>`;

// ─── Formatting helpers ───────────────────────────────────────────────────────

export function fmtDateShort(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function fmtDateMed(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

export function fmtTime(time: string | undefined): string {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'pm' : 'am';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')}${ampm}`;
}

export function fmtCost(cost: Cost): string {
  return `$${cost.amountPreferredCurrency.toFixed(2)} ${cost.preferredCurrency}`;
}

export function fmtCurrency(amount: number, currency: string): string {
  return `$${amount.toFixed(2)} ${currency}`;
}

// ─── Day-range generation ─────────────────────────────────────────────────────

export function buildDays(
  startDate: string | null,
  endDate: string | null,
  events: TimelineEvent[],
  activities: Activity[],
): string[] {
  const knownDates = new Set<string>([
    ...events.map((e) => e.date.slice(0, 10)),
    ...activities.filter((a) => a.scheduledDate).map((a) => a.scheduledDate!.slice(0, 10)),
  ]);
  if (!startDate && !endDate) return Array.from(knownDates).sort();
  const days: string[] = [];
  const start = new Date((startDate ?? endDate!) + 'T12:00:00');
  const end = new Date((endDate ?? startDate!) + 'T12:00:00');
  const cursor = new Date(start);
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  for (const d of knownDates) if (!days.includes(d)) days.push(d);
  return days.sort();
}

export interface ContentDay {
  day: string;
  dayNumber: number;
  events: TimelineEvent[];
  dayActivities: Activity[];
}

/** Shared: build sorted list of days with their events + scheduled activities. */
export function buildContentDays(payload: TripExportPayload): ContentDay[] {
  const { trip, timeline, activities } = payload;
  const scheduledActivities = activities.filter((a) => a.scheduledDate);
  const days = buildDays(trip.startDate, trip.endDate, timeline, scheduledActivities);
  const result: ContentDay[] = [];
  let dayNumber = 1;
  for (const day of days) {
    const dayEvents = timeline.filter((e) => e.date.slice(0, 10) === day && e.type !== 'expense');
    const dayActivities = scheduledActivities.filter((a) => a.scheduledDate === day);
    if (dayEvents.length > 0 || dayActivities.length > 0) {
      result.push({ day, dayNumber, events: dayEvents, dayActivities });
    }
    dayNumber++;
  }
  return result;
}
