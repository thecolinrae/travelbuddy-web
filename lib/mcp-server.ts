import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp';
import { z } from 'zod';
import {
  listTrips,
  getTrip,
  createTrip,
  updateTrip,
  loadTimeline,
  loadTimelineWindow,
  getTimelineEventByDataId,
  saveTimeline,
  loadActivities,
  saveActivities,
  updateBudgetGoals,
  type TripRow,
} from '@/services/db';
import { suggestActivities } from '@/services/claude';
import { enrichIfMissingAddress } from '@/services/activityEnrich';
import { verifyPlaceAddress } from '@/services/places';
import { nanoid } from '@/services/nanoid';
import { makeCost, fetchRatesFromPreferred } from '@/services/currency';
import type {
  Activity,
  ActivityEvent,
  ActivityType,
  BudgetItemCategory,
  Cost,
  ExpenseEvent,
  FlightArrivalEvent,
  FlightConnectionEvent,
  FlightDepartureEvent,
  HotelCheckInEvent,
  TimelineEvent,
  TransportDepartureEvent,
} from '@/types';

function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

function fail(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true };
}

function offsetDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function eventSummary(e: TimelineEvent): string {
  switch (e.type) {
    case 'flight':
      if (e.subtype === 'departure') {
        const f = e as FlightDepartureEvent;
        return `Flight ${f.flightNo} ${f.departureAirport} → ${f.arrivalAirport}`;
      }
      if (e.subtype === 'arrival') return `Arrives ${(e as FlightArrivalEvent).arrivalAirport}`;
      return `Connection at ${(e as FlightConnectionEvent).connectionAirport}`;
    case 'hotel':
      return `${e.subtype === 'check_in' ? 'Check-in' : 'Check-out'} ${(e as HotelCheckInEvent).hotelName}`;
    case 'otherTransportation':
      return `${e.subtype === 'departure' ? 'Departs' : 'Arrives'} ${(e as TransportDepartureEvent).departureLocation ?? e.locationCity}`;
    case 'expense':
      return `Expense: ${(e as ExpenseEvent).description}`;
    case 'activity':
      return `Activity: ${(e as ActivityEvent).description}`;
    default:
      return e.type;
  }
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
    'get_timeline_summary',
    {
      description: 'Get a compact day-by-day summary of a trip timeline — dates, cities visited, and one-liner per event. Use this to orient yourself before calling get_timeline with a specific date.',
      inputSchema: { tripId: z.string() },
    },
    async ({ tripId }) => {
      if (!await getTrip(tripId, userId)) return fail('Trip not found or not accessible');
      const events = await loadTimeline(tripId);
      const byDate = new Map<string, { cities: Set<string>; events: { type: string; summary: string }[] }>();
      for (const e of events) {
        const key = e.date ?? 'undated';
        if (!byDate.has(key)) byDate.set(key, { cities: new Set(), events: [] });
        const bucket = byDate.get(key)!;
        if (e.locationCity) bucket.cities.add(e.locationCity);
        bucket.events.push({ type: e.type, summary: eventSummary(e) });
      }
      const summary = [...byDate.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, { cities, events: evts }]) => ({
          date,
          cities: [...cities],
          events: evts,
        }));
      return ok(summary);
    },
  );

  server.registerTool(
    'get_timeline',
    {
      description:
        'Get timeline events for a trip. Provide date, eventId, or startDate+endDate for a focused window (strongly preferred — full timelines can be very large). Omit all filters only as a last resort.',
      inputSchema: {
        tripId: z.string(),
        date: z.string().optional().describe('YYYY-MM-DD anchor date — returns events ±1 day around this date.'),
        eventId: z.string().optional().describe('Event ID — returns events ±1 day around that event\'s date.'),
        startDate: z.string().optional().describe('YYYY-MM-DD explicit range start (use with endDate).'),
        endDate: z.string().optional().describe('YYYY-MM-DD explicit range end (use with startDate).'),
      },
    },
    async ({ tripId, date, eventId, startDate, endDate }) => {
      if (!await getTrip(tripId, userId)) return fail('Trip not found or not accessible');
      if (eventId) {
        const event = await getTimelineEventByDataId(tripId, eventId);
        if (!event) return fail('Event not found');
        if (!event.date) return ok([event]);
        return ok(await loadTimelineWindow(tripId, offsetDate(event.date, -1), offsetDate(event.date, 1)));
      }
      if (date) {
        return ok(await loadTimelineWindow(tripId, offsetDate(date, -1), offsetDate(date, 1)));
      }
      if (startDate && endDate) {
        return ok(await loadTimelineWindow(tripId, startDate, endDate));
      }
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

  // ── Activity write tools (owner only) ──────────────────────────────────────
  //
  // IMPORTANT: Never add a tool here that invokes Claude chat, calls an AI
  // agent, or delegates to the TravelBuddy chatbot. Doing so would create a
  // logic loop: chat → agents-web agent → MCP → chat → ...
  //
  // Tools that call Claude for data enrichment (enrichIfMissingAddress,
  // suggest_activities) are acceptable because they are leaf operations, not
  // conversational agent calls.

  server.registerTool(
    'add_activity',
    {
      description: 'Add a new activity to a trip\'s activity pool. Enriches details and verifies the address via Google Maps. Owner only.',
      inputSchema: {
        tripId: z.string(),
        name: z.string().describe('Activity name'),
        description: z.string().describe('2–3 sentence description'),
        type: z.enum(['sightseeing', 'food', 'adventure', 'culture', 'shopping', 'nightlife', 'nature', 'wellness']),
        city: z.string().describe('City where the activity takes place'),
        scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('YYYY-MM-DD'),
        scheduledTime: z.string().regex(/^\d{2}:\d{2}$/).optional().describe('HH:MM (24-hour)'),
        estimatedCost: z.string().optional().describe('e.g. "$10–20 per person"'),
        duration: z.string().optional().describe('e.g. "2–3 hours"'),
        tips: z.string().optional().describe('One practical tip for visitors'),
      },
    },
    async ({ tripId, name, description, type, city, scheduledDate, scheduledTime, estimatedCost, duration, tips }) => {
      const trip = await getTrip(tripId, userId);
      if (!trip) return fail('Trip not found or not accessible');
      if (trip.userId !== userId) return fail('Forbidden: only the trip owner can add activities');

      const existing = await loadActivities(tripId);
      const activities: Activity[] = existing?.savedActivities ?? [];
      const destination = existing?.destination ?? trip.destination;

      const newActivity: Activity = {
        id: nanoid(12),
        name,
        description,
        type: type as ActivityType,
        city,
        scheduledDate,
        scheduledTime,
        estimatedCost,
        duration,
        tips,
        saved: true,
      };

      const enriched = await enrichIfMissingAddress(newActivity);

      const verification = await verifyPlaceAddress(enriched.name, enriched.city ?? '');
      if (verification.permanentlyClosed) {
        return fail(`"${enriched.name}" appears to be permanently closed according to Google Maps. Suggest an alternative.`);
      }
      const verified: Activity = {
        ...enriched,
        ...(verification.found && {
          address: verification.address ?? enriched.address,
          latitude: verification.lat,
          longitude: verification.lng,
        }),
      };

      await saveActivities(tripId, destination, [...activities, verified]);
      return ok({ success: true, activity: verified });
    },
  );

  server.registerTool(
    'reschedule_activity',
    {
      description: 'Move a scheduled activity to a different date or time. Owner only.',
      inputSchema: {
        tripId: z.string(),
        activityId: z.string().describe('Activity ID from get_activities'),
        scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('YYYY-MM-DD'),
        scheduledTime: z.string().regex(/^\d{2}:\d{2}$/).optional().describe('HH:MM (24-hour)'),
      },
    },
    async ({ tripId, activityId, scheduledDate, scheduledTime }) => {
      const trip = await getTrip(tripId, userId);
      if (!trip) return fail('Trip not found or not accessible');
      if (trip.userId !== userId) return fail('Forbidden: only the trip owner can reschedule activities');

      const existing = await loadActivities(tripId);
      const activities: Activity[] = existing?.savedActivities ?? [];
      const destination = existing?.destination ?? trip.destination;
      const idx = activities.findIndex((a) => a.id === activityId);
      if (idx === -1) return fail('Activity not found');

      activities[idx] = await enrichIfMissingAddress({
        ...activities[idx],
        scheduledDate,
        scheduledTime: scheduledTime ?? undefined,
      });
      await saveActivities(tripId, destination, activities);
      return ok({ success: true, activity: activities[idx] });
    },
  );

  server.registerTool(
    'remove_activity',
    {
      description: 'Unschedule an activity (keep it saved but remove its date) or delete it entirely. Owner only.',
      inputSchema: {
        tripId: z.string(),
        activityId: z.string().describe('Activity ID from get_activities'),
        action: z.enum(['unschedule', 'delete']).describe('"unschedule" removes the date; "delete" removes the activity entirely'),
      },
    },
    async ({ tripId, activityId, action }) => {
      const trip = await getTrip(tripId, userId);
      if (!trip) return fail('Trip not found or not accessible');
      if (trip.userId !== userId) return fail('Forbidden: only the trip owner can remove activities');

      const existing = await loadActivities(tripId);
      let activities: Activity[] = existing?.savedActivities ?? [];
      const destination = existing?.destination ?? trip.destination;
      const target = activities.find((a) => a.id === activityId);
      if (!target) return fail('Activity not found');

      if (action === 'delete') {
        activities = activities.filter((a) => a.id !== activityId);
      } else {
        activities = activities.map((a) =>
          a.id === activityId ? { ...a, scheduledDate: undefined, scheduledTime: undefined } : a,
        );
      }
      await saveActivities(tripId, destination, activities);
      return ok({ success: true });
    },
  );

  server.registerTool(
    'update_activity',
    {
      description: 'Update the city or address of an existing activity. Owner only.',
      inputSchema: {
        tripId: z.string(),
        activityId: z.string().describe('Activity ID from get_activities'),
        city: z.string().optional().describe('Updated city name'),
        address: z.string().optional().describe('Updated address'),
      },
    },
    async ({ tripId, activityId, city, address }) => {
      const trip = await getTrip(tripId, userId);
      if (!trip) return fail('Trip not found or not accessible');
      if (trip.userId !== userId) return fail('Forbidden: only the trip owner can update activities');

      const existing = await loadActivities(tripId);
      const activities: Activity[] = existing?.savedActivities ?? [];
      const destination = existing?.destination ?? trip.destination;
      const idx = activities.findIndex((a) => a.id === activityId);
      if (idx === -1) return fail('Activity not found');

      activities[idx] = {
        ...activities[idx],
        ...(city !== undefined && { city }),
        ...(address !== undefined && { address }),
      };
      await saveActivities(tripId, destination, activities);
      return ok({ success: true, activity: activities[idx] });
    },
  );

  server.registerTool(
    'update_timeline_event',
    {
      description: 'Update the city or address of a timeline event (hotel, activity booking, etc.). Owner only.',
      inputSchema: {
        tripId: z.string(),
        eventId: z.string().describe('Event ID from get_timeline'),
        locationCity: z.string().optional().describe('Updated city'),
        locationAddress: z.string().optional().describe('Updated address'),
      },
    },
    async ({ tripId, eventId, locationCity, locationAddress }) => {
      const trip = await getTrip(tripId, userId);
      if (!trip) return fail('Trip not found or not accessible');
      if (trip.userId !== userId) return fail('Forbidden: only the trip owner can update timeline events');

      const timeline = await loadTimeline(tripId);
      const idx = timeline.findIndex((e) => e.id === eventId);
      if (idx === -1) return fail('Event not found');

      timeline[idx] = {
        ...timeline[idx],
        ...(locationCity !== undefined && { locationCity }),
        ...(locationAddress !== undefined && { locationAddress }),
      } as TimelineEvent;
      await saveTimeline(tripId, timeline);
      return ok({ success: true, event: timeline[idx] });
    },
  );

  server.registerTool(
    'verify_address',
    {
      description: 'Verify the address of an activity or timeline event against Google Maps. Checks closure status and corrects stored address and coordinates. Provide either activityId or eventId. Owner only.',
      inputSchema: {
        tripId: z.string(),
        activityId: z.string().optional().describe('Activity ID from get_activities — provide this OR eventId'),
        eventId: z.string().optional().describe('Event ID from get_timeline — provide this OR activityId'),
      },
    },
    async ({ tripId, activityId, eventId }) => {
      const trip = await getTrip(tripId, userId);
      if (!trip) return fail('Trip not found or not accessible');

      if (activityId) {
        const existing = await loadActivities(tripId);
        const activities: Activity[] = existing?.savedActivities ?? [];
        const destination = existing?.destination ?? trip.destination;
        const idx = activities.findIndex((a) => a.id === activityId);
        if (idx === -1) return fail('Activity not found');

        const activity = activities[idx];
        const v = await verifyPlaceAddress(activity.name, activity.city ?? '');
        if (!v.found) return ok({ verified: false, message: `Could not find "${activity.name}" on Google Maps — address unchanged.` });
        if (v.permanentlyClosed) return ok({ verified: true, permanentlyClosed: true, message: `"${activity.name}" is permanently closed on Google Maps.`, matchedName: v.matchedName });

        activities[idx] = { ...activity, address: v.address ?? activity.address, latitude: v.lat, longitude: v.lng };
        await saveActivities(tripId, destination, activities);
        return ok({ verified: true, permanentlyClosed: false, updatedAddress: v.address, matchedName: v.matchedName });
      }

      if (eventId) {
        const timeline = await loadTimeline(tripId);
        const idx = timeline.findIndex((e) => e.id === eventId);
        if (idx === -1) return fail('Event not found');

        const event = timeline[idx];
        let searchName = '';
        const searchCity = event.locationCity;
        if (event.type === 'hotel') {
          searchName = (event as import('@/types').HotelCheckInEvent).hotelName;
        } else if (event.type === 'activity') {
          searchName = (event as import('@/types').ActivityEvent).description;
        } else {
          return fail('Address verification is supported for hotel and activity events only.');
        }

        const v = await verifyPlaceAddress(searchName, searchCity);
        if (!v.found) return ok({ verified: false, message: `Could not find "${searchName}" on Google Maps — address unchanged.` });
        if (v.permanentlyClosed) return ok({ verified: true, permanentlyClosed: true, message: `"${searchName}" is permanently closed on Google Maps.`, matchedName: v.matchedName });

        timeline[idx] = { ...timeline[idx], locationAddress: v.address ?? event.locationAddress } as TimelineEvent;
        await saveTimeline(tripId, timeline);
        return ok({ verified: true, permanentlyClosed: false, updatedAddress: v.address, matchedName: v.matchedName });
      }

      return fail('Provide either activityId or eventId.');
    },
  );

  server.registerTool(
    'merge_events',
    {
      description: 'Link a planned activity to a confirmed activity booking event. The activityId comes from get_activities; the eventId comes from get_timeline (type=activity). Owner only.',
      inputSchema: {
        tripId: z.string(),
        activityId: z.string().describe('Planned activity ID from get_activities'),
        eventId: z.string().describe('Activity booking event ID from get_timeline'),
      },
    },
    async ({ tripId, activityId, eventId }) => {
      const trip = await getTrip(tripId, userId);
      if (!trip) return fail('Trip not found or not accessible');
      if (trip.userId !== userId) return fail('Forbidden: only the trip owner can merge events');

      const [activitiesData, timeline] = await Promise.all([loadActivities(tripId), loadTimeline(tripId)]);
      const activities: Activity[] = activitiesData?.savedActivities ?? [];
      const actIdx = activities.findIndex((a) => a.id === activityId);
      if (actIdx === -1) return fail('Activity not found');
      const evIdx = timeline.findIndex((e) => e.id === eventId);
      if (evIdx === -1) return fail('Event not found');
      if (timeline[evIdx].type !== 'activity') return fail('Event is not an activity booking — only activity-type events can be linked');

      const activity = activities[actIdx];
      const event = timeline[evIdx];
      if (activity.linkedEventId) return fail(`"${activity.name}" is already linked to another event`);
      if ((event as TimelineEvent & { linkedActivityId?: string }).linkedActivityId) return fail('That event is already linked to another activity');

      activities[actIdx] = { ...activity, linkedEventId: eventId };
      timeline[evIdx] = { ...event, linkedActivityId: activityId };
      await Promise.all([
        saveActivities(tripId, activitiesData?.destination ?? trip.destination, activities),
        saveTimeline(tripId, timeline),
      ]);
      return ok({ success: true, message: `Linked "${activity.name}" with event ${eventId}.` });
    },
  );

  server.registerTool(
    'set_budget_targets',
    {
      description: "Update the trip's overall budget goal and/or per-category spending targets. Owner only.",
      inputSchema: {
        tripId: z.string(),
        budgetGoal: z.number().positive().optional().describe("New overall trip budget in the trip's preferred currency"),
        categoryGoals: z.object({
          flights: z.number().optional(),
          hotels: z.number().optional(),
          car_rental: z.number().optional(),
          activities: z.number().optional(),
          transport: z.number().optional(),
          food: z.number().optional(),
          insurance: z.number().optional(),
          other: z.number().optional(),
        }).optional().describe('Per-category spending targets (only include categories to change)'),
      },
    },
    async ({ tripId, budgetGoal, categoryGoals }) => {
      const trip = await getTrip(tripId, userId);
      if (!trip) return fail('Trip not found or not accessible');
      if (trip.userId !== userId) return fail('Forbidden: only the trip owner can set budget targets');

      const updatedGoal = budgetGoal ?? trip.budgetGoal;
      const updatedCategoryGoals: Partial<Record<BudgetItemCategory, number>> = {
        ...(trip.categoryGoals ?? {}),
        ...(categoryGoals ?? {}),
      };
      await updateBudgetGoals(tripId, userId, updatedGoal ?? null, updatedCategoryGoals);
      return ok({ success: true, budgetGoal: updatedGoal, categoryGoals: updatedCategoryGoals });
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
