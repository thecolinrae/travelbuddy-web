import type { TripRow } from '@/services/db';
import type { TimelineEvent, Activity } from '@/types';

export interface TripContextInput {
  trip: TripRow;
  timeline: TimelineEvent[];
  activities: Activity[];
  currentDayIndex: number;
}

export interface TripContextResult {
  systemPrompt: string;
  wasSummarized: boolean;
}

const TOKEN_BUDGET = 8000;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function addDay(date: string): string {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function buildDayRange(
  startDate: string | null,
  endDate: string | null,
  timeline: TimelineEvent[],
  activities: Activity[],
): string[] {
  const dates: string[] = [];
  for (const e of timeline) {
    if (e.type !== 'expense' && e.date) dates.push(e.date);
  }
  for (const a of activities) {
    if (a.scheduledDate) dates.push(a.scheduledDate);
  }
  if (startDate) dates.push(startDate);
  if (endDate) dates.push(endDate);
  if (dates.length === 0) return [];
  dates.sort();
  let cursor = dates[0];
  const last = dates[dates.length - 1];
  const range: string[] = [];
  while (cursor <= last) {
    range.push(cursor);
    cursor = addDay(cursor);
  }
  return range;
}

function formatEventLine(event: TimelineEvent): string {
  switch (event.type) {
    case 'flight':
      if (event.subtype === 'departure')
        return `- [FLIGHT] ${event.flightNo} departs ${event.departureAirport} → ${event.arrivalAirport}${event.time ? ` at ${event.time}` : ''}`;
      if (event.subtype === 'arrival')
        return `- [FLIGHT] ${event.flightNo} arrives ${event.arrivalAirport}${event.time ? ` at ${event.time}` : ''}`;
      if (event.subtype === 'connection')
        return `- [CONNECTION] ${event.connectionAirport}${event.layoverMinutes ? ` (~${event.layoverMinutes}min layover)` : ''}`;
      break;
    case 'hotel':
      if (event.subtype === 'check_in')
        return `- [HOTEL CHECK-IN] ${event.hotelName}${event.numberOfNights ? ` (${event.numberOfNights} nights)` : ''}${event.time ? ` at ${event.time}` : ''}`;
      if (event.subtype === 'check_out')
        return `- [HOTEL CHECK-OUT] ${event.hotelName}${event.time ? ` at ${event.time}` : ''}`;
      break;
    case 'otherTransportation':
      return `- [TRANSPORT] ${event.transportType} from ${event.departureLocation} to ${event.arrivalLocation}${event.time ? ` at ${event.time}` : ''}`;
    case 'activity':
      return `- [ACTIVITY] ${event.description}${event.time ? ` at ${event.time}` : ''}`;
  }
  return '';
}

function renderDayFull(
  date: string,
  dayNum: number,
  timeline: TimelineEvent[],
  activities: Activity[],
): string {
  const label = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const lines: string[] = [`## Day ${dayNum} — ${date} (${label})`];

  const dayEvents = timeline.filter((e) => e.date === date);
  const dayActivities = activities.filter((a) => a.scheduledDate === date);

  if (dayEvents.length === 0 && dayActivities.length === 0) {
    lines.push('- (no events scheduled)');
  }
  for (const event of dayEvents) {
    const line = formatEventLine(event);
    if (line) lines.push(line);
  }
  for (const activity of dayActivities) {
    lines.push(
      `- [ACTIVITY] ${activity.name} (${activity.type})${activity.scheduledTime ? ` at ${activity.scheduledTime}` : ''}${activity.city ? ` in ${activity.city}` : ''}`,
    );
  }

  return lines.join('\n');
}

function renderDaySummary(
  date: string,
  dayNum: number,
  timeline: TimelineEvent[],
  activities: Activity[],
): string {
  const dayEvents = timeline.filter((e) => e.date === date);
  const dayActivities = activities.filter((a) => a.scheduledDate === date);
  const total = dayEvents.length + dayActivities.length;
  const types = [
    ...new Set([...dayEvents.map((e) => e.type), ...dayActivities.map(() => 'activity')]),
  ];
  return `Day ${dayNum} (${date}): ${total} event${total !== 1 ? 's' : ''} — ${types.join(', ') || 'none'}`;
}

function buildActivitiesBank(activities: Activity[]): string {
  if (activities.length === 0) return 'No activities saved.';
  return activities
    .map((a) => {
      let line = `- [${a.id}] ${a.name} (${a.type})`;
      if (a.city) line += ` — ${a.city}`;
      if (a.scheduledDate) {
        line += ` — scheduled ${a.scheduledDate}`;
        if (a.scheduledTime) line += ` at ${a.scheduledTime}`;
      } else {
        line += ' — unscheduled';
      }
      return line;
    })
    .join('\n');
}

export function buildTripContext(input: TripContextInput): TripContextResult {
  const { trip, timeline, activities, currentDayIndex } = input;
  const today = new Date().toISOString().slice(0, 10);

  const days = buildDayRange(trip.startDate, trip.endDate, timeline, activities);

  const header = [
    `You are a knowledgeable travel assistant for TravelBuddy. You help travelers understand their itinerary and manage their activities.`,
    ``,
    `Today's date: ${today}`,
    ``,
    `## Trip: ${trip.name}`,
    `- Destinations: ${trip.destinations.length > 0 ? trip.destinations.join(', ') : trip.destination}`,
    `- Dates: ${trip.startDate ?? 'TBD'} to ${trip.endDate ?? 'TBD'}`,
    `- Status: ${trip.status}`,
    ``,
    `## What you can do`,
    `You have tools to manage activities: add new ones, schedule or reschedule existing ones, remove them, or suggest recommendations.`,
    `You cannot modify flights, hotels, or transportation — those come from imported bookings.`,
    `When adding activities, confirm the date with the user unless they have already specified one.`,
    `When suggesting activities, use the suggest_activities tool, present the results, and offer to add specific ones.`,
    ``,
    `## Activities Bank (${activities.length} saved)`,
    buildActivitiesBank(activities),
    ``,
    `## Trip Itinerary`,
  ].join('\n');

  if (days.length === 0) {
    return { systemPrompt: header + '\n(No itinerary days yet.)', wasSummarized: false };
  }

  // Try full detail first
  const fullItinerary = days
    .map((date, i) => renderDayFull(date, i + 1, timeline, activities))
    .join('\n\n');
  const fullPrompt = header + '\n' + fullItinerary;

  if (estimateTokens(fullPrompt) <= TOKEN_BUDGET) {
    return { systemPrompt: fullPrompt, wasSummarized: false };
  }

  // Summarize distant days, keep currentDayIndex ±1 at full detail
  const focusIndices = new Set(
    [currentDayIndex - 1, currentDayIndex, currentDayIndex + 1].filter(
      (i) => i >= 0 && i < days.length,
    ),
  );

  const summarizedItinerary = days
    .map((date, i) =>
      focusIndices.has(i)
        ? renderDayFull(date, i + 1, timeline, activities)
        : renderDaySummary(date, i + 1, timeline, activities),
    )
    .join('\n\n');

  const summarizedPrompt =
    header +
    '\n' +
    summarizedItinerary +
    '\n\n[Note: Days outside your current view are summarized. Ask about a specific day for full detail.]';

  return { systemPrompt: summarizedPrompt, wasSummarized: true };
}
