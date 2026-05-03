import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp';
import { z } from 'zod';
import {
  listTrips,
  getTrip,
  createTrip,
  updateTrip,
  loadTimeline,
  saveTimeline,
  loadActivities,
  saveActivities,
  type TripRow,
} from '@/services/db';
import { suggestActivities } from '@/services/claude';
import { makeCost, fetchRatesFromPreferred } from '@/services/currency';
import type { Cost, ExpenseEvent, TimelineEvent } from '@/types';

function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

function fail(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true };
}

export function createMcpServer(userId: string): McpServer {
  const server = new McpServer({ name: 'travelbuddy', version: '1.0.0' });

  // ── Read tools (owned + shared trips) ──────────────────────────────────────

  server.registerTool(
    'list_trips',
    { description: 'List all trips (owned and shared with you).' },
    async () => ok(await listTrips(userId)),
  );

  server.registerTool(
    'get_trip',
    {
      description: 'Get trip details by ID.',
      inputSchema: { tripId: z.string().describe('The trip ID') },
    },
    async ({ tripId }) => {
      const trip = await getTrip(tripId, userId);
      return trip ? ok(trip) : fail('Trip not found or not accessible');
    },
  );

  server.registerTool(
    'get_timeline',
    {
      description: 'Get all timeline events (flights, hotels, transport, expenses, activities) for a trip.',
      inputSchema: { tripId: z.string() },
    },
    async ({ tripId }) => {
      if (!await getTrip(tripId, userId)) return fail('Trip not found or not accessible');
      return ok(await loadTimeline(tripId));
    },
  );

  server.registerTool(
    'get_activities',
    {
      description: 'Get the activity pool for a trip.',
      inputSchema: { tripId: z.string() },
    },
    async ({ tripId }) => {
      if (!await getTrip(tripId, userId)) return fail('Trip not found or not accessible');
      return ok(await loadActivities(tripId) ?? { destination: '', savedActivities: [] });
    },
  );

  server.registerTool(
    'export_trip_markdown',
    {
      description: 'Export a trip as a readable markdown itinerary.',
      inputSchema: { tripId: z.string() },
    },
    async ({ tripId }) => {
      const trip = await getTrip(tripId, userId);
      if (!trip) return fail('Trip not found or not accessible');
      const timeline = await loadTimeline(tripId);
      return { content: [{ type: 'text' as const, text: buildMarkdown(trip, timeline) }] };
    },
  );

  // ── Write tools (owner only) ────────────────────────────────────────────────

  server.registerTool(
    'create_trip',
    {
      description: 'Create a new trip.',
      inputSchema: {
        name: z.string().describe('Trip name'),
        destination: z.string().optional().describe('Primary destination city/country'),
        destinations: z.array(z.string()).optional().describe('All destinations for multi-city trips'),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('YYYY-MM-DD'),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('YYYY-MM-DD'),
        budgetGoal: z.number().positive().optional(),
        preferredCurrency: z.string().length(3).optional().describe('ISO 4217 code, e.g. CAD, USD, EUR'),
        notes: z.string().optional(),
        coverEmoji: z.string().optional(),
      },
    },
    async (args) => ok(await createTrip(userId, args)),
  );

  server.registerTool(
    'update_trip',
    {
      description: 'Update trip metadata (name, dates, destination, notes, budget, status). Owner only.',
      inputSchema: {
        tripId: z.string(),
        name: z.string().optional(),
        destination: z.string().optional(),
        destinations: z.array(z.string()).optional(),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('YYYY-MM-DD'),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('YYYY-MM-DD'),
        status: z.enum(['upcoming', 'active', 'completed']).optional(),
        notes: z.string().optional(),
        budgetGoal: z.number().positive().optional(),
        preferredCurrency: z.string().length(3).optional(),
        coverEmoji: z.string().optional(),
      },
    },
    async ({ tripId, ...updates }) => {
      const trip = await getTrip(tripId, userId);
      if (!trip) return fail('Trip not found or not accessible');
      if (trip.userId !== userId) return fail('Forbidden: only the trip owner can edit it');
      return ok(await updateTrip(tripId, userId, updates));
    },
  );

  server.registerTool(
    'add_expense',
    {
      description: 'Add an expense to a trip. Owner only.',
      inputSchema: {
        tripId: z.string(),
        description: z.string(),
        category: z.enum(['flights', 'hotels', 'food', 'transport', 'activities', 'shopping', 'insurance', 'other']),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('YYYY-MM-DD'),
        amount: z.number().positive(),
        currency: z.string().length(3).describe('ISO 4217 currency code of the amount'),
        vendor: z.string().optional(),
        locationCity: z.string().optional(),
        notes: z.string().optional(),
      },
    },
    async ({ tripId, description, category, date, amount, currency, vendor, locationCity, notes }) => {
      const trip = await getTrip(tripId, userId);
      if (!trip) return fail('Trip not found or not accessible');
      if (trip.userId !== userId) return fail('Forbidden: only the trip owner can add expenses');

      let cost: Cost;
      if (currency !== trip.preferredCurrency) {
        const { rates } = await fetchRatesFromPreferred(trip.preferredCurrency);
        cost = makeCost(amount, currency, trip.preferredCurrency, rates);
      } else {
        cost = { amountPreferredCurrency: amount, preferredCurrency: trip.preferredCurrency };
      }

      const expense: ExpenseEvent = {
        id: crypto.randomUUID(),
        type: 'expense',
        date,
        locationCity: locationCity ?? '',
        description,
        vendor,
        category,
        cost,
        isManual: true,
        notes,
      };

      const timeline = await loadTimeline(tripId);
      timeline.push(expense);
      timeline.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
      await saveTimeline(tripId, timeline);
      return ok(expense);
    },
  );

  server.registerTool(
    'schedule_activity',
    {
      description: "Schedule an activity to a specific date. The activity must already be in the trip's pool (use get_activities to find IDs). Owner only.",
      inputSchema: {
        tripId: z.string(),
        activityId: z.string().describe('ID of the activity from get_activities'),
        scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('YYYY-MM-DD'),
        scheduledTime: z.string().regex(/^\d{2}:\d{2}$/).optional().describe('HH:MM (24-hour)'),
      },
    },
    async ({ tripId, activityId, scheduledDate, scheduledTime }) => {
      const trip = await getTrip(tripId, userId);
      if (!trip) return fail('Trip not found or not accessible');
      if (trip.userId !== userId) return fail('Forbidden: only the trip owner can schedule activities');

      const data = await loadActivities(tripId);
      if (!data) return fail('No activities found for this trip');
      const idx = data.savedActivities.findIndex(a => a.id === activityId);
      if (idx === -1) return fail('Activity not found');

      data.savedActivities[idx] = {
        ...data.savedActivities[idx],
        scheduledDate,
        ...(scheduledTime !== undefined && { scheduledTime }),
      };
      await saveActivities(tripId, data.destination, data.savedActivities);
      return ok(data.savedActivities[idx]);
    },
  );

  server.registerTool(
    'suggest_activities',
    {
      description: "Use AI to suggest activities for a destination and save them to the trip's activity pool. Owner only.",
      inputSchema: {
        tripId: z.string(),
        destination: z.string().describe('City or area to suggest activities for'),
        customPrompt: z.string().optional().describe('Additional instructions, e.g. "focus on outdoor activities" or "we have kids"'),
      },
    },
    async ({ tripId, destination, customPrompt }) => {
      const trip = await getTrip(tripId, userId);
      if (!trip) return fail('Trip not found or not accessible');
      if (trip.userId !== userId) return fail('Forbidden: only the trip owner can request activity suggestions');

      const suggestions = await suggestActivities(
        destination,
        trip.startDate ?? '',
        trip.endDate ?? '',
        customPrompt,
      );

      const existing = await loadActivities(tripId);
      const existingNames = new Set((existing?.savedActivities ?? []).map(a => a.name.toLowerCase()));
      const newOnes = suggestions.filter(s => !existingNames.has(s.name.toLowerCase()));
      const merged = [...(existing?.savedActivities ?? []), ...newOnes];
      await saveActivities(tripId, destination, merged);
      return ok({ added: newOnes.length, activities: newOnes });
    },
  );

  // ── Resources ───────────────────────────────────────────────────────────────

  server.registerResource(
    'trips',
    'travelbuddy://trips',
    { description: 'All trips for this user (owned and shared)', mimeType: 'application/json' },
    async (uri) => ({
      contents: [{
        uri: uri.href,
        mimeType: 'application/json',
        text: JSON.stringify(await listTrips(userId), null, 2),
      }],
    }),
  );

  server.registerResource(
    'trip',
    new ResourceTemplate('travelbuddy://trips/{id}', { list: undefined }),
    { description: 'Trip detail with timeline summary', mimeType: 'application/json' },
    async (uri, { id }) => {
      const trip = await getTrip(id as string, userId);
      if (!trip) return { contents: [] };
      const timeline = await loadTimeline(id as string);
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify({
            ...trip,
            timelineEventCount: timeline.length,
            eventTypes: [...new Set(timeline.map(e => e.type))],
          }, null, 2),
        }],
      };
    },
  );

  return server;
}

function buildMarkdown(trip: TripRow, timeline: TimelineEvent[]): string {
  const lines: string[] = [`# ${trip.name}`, ''];
  const dest = trip.destination || trip.destinations.join(', ');
  if (dest) lines.push(`**Destination:** ${dest}`);
  if (trip.startDate || trip.endDate) lines.push(`**Dates:** ${trip.startDate ?? '?'} → ${trip.endDate ?? '?'}`);
  if (trip.budgetGoal) lines.push(`**Budget:** ${trip.preferredCurrency} ${trip.budgetGoal.toLocaleString()}`);
  if (trip.notes) lines.push('', '## Notes', '', trip.notes);

  const byDate = new Map<string, TimelineEvent[]>();
  for (const e of timeline) {
    const day = e.date ?? 'Undated';
    (byDate.get(day) ?? byDate.set(day, []).get(day)!).push(e);
  }

  if (byDate.size > 0) {
    lines.push('', '## Itinerary', '');
    for (const [date, events] of [...byDate.entries()].sort()) {
      lines.push(`### ${date}`, '');
      for (const e of events) lines.push(formatEvent(e));
      lines.push('');
    }
  }

  return lines.join('\n');
}

function formatEvent(e: TimelineEvent): string {
  switch (e.type) {
    case 'flight':
      if (e.subtype === 'departure') return `- **Flight** ${e.flightNo} ${e.departureAirport} → ${e.arrivalAirport}${e.time ? ` at ${e.time}` : ''}`;
      if (e.subtype === 'arrival') return `- **Arrival** ${e.flightNo} at ${e.arrivalAirport}`;
      return `- **Connection** at ${e.connectionAirport}${e.layoverMinutes ? ` (${e.layoverMinutes}min layover)` : ''}`;
    case 'hotel':
      return e.subtype === 'check_in'
        ? `- **Check-in** ${e.hotelName}${e.time ? ` at ${e.time}` : ''}`
        : `- **Check-out** ${e.hotelName}`;
    case 'otherTransportation':
      return `- **${e.transportType}** ${e.departureLocation} → ${e.arrivalLocation}${e.vendor ? ` (${e.vendor})` : ''}`;
    case 'expense':
      return `- **${e.description}** — ${e.cost.preferredCurrency} ${e.cost.amountPreferredCurrency.toFixed(2)} (${e.category})`;
    case 'activity':
      return `- **${e.description}**`;
  }
}
