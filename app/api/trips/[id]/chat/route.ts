import { withTripAuth } from '@/lib/api';
import { loadTimeline, saveTimeline, loadActivities, saveActivities, updateBudgetGoals } from '@/services/db';
import { buildTripContext } from '@/services/tripContext';
import {
  streamTripChat,
  suggestActivities,
  type ChatToolDefinition,
  type AnthropicChatMessage,
  type AnthropicContentBlock,
} from '@/services/claude';
import { filterOpenPlaces, verifyPlaceAddress } from '@/services/places';
import { nanoid } from '@/services/nanoid';
import { enrichIfMissingAddress } from '@/services/activityEnrich';
import { streamAgentChat, continueAgentChat } from '@/services/agentClient';
import type { Activity, ActivityType, BudgetItemCategory, TimelineEvent } from '@/types';
import type { TripRow } from '@/services/db';

// ─── Request / SSE event types ────────────────────────────────────────────────

interface ChatRequest {
  messages: { role: 'user' | 'assistant'; content: string }[];
  currentDayIndex: number;
  currentDate?: string | null;
  agentRunId?: string;
}

type ChatSSEEvent =
  | { type: 'text'; content: string }
  | { type: 'tool_result'; tool: string; result: unknown; mutated: boolean }
  | { type: 'question'; questions: import('@/services/agentClient').QuestionItem[] }
  | { type: 'error'; message: string }
  | { type: 'done' };

// ─── Tool definitions ─────────────────────────────────────────────────────────

const CHAT_TOOLS: ChatToolDefinition[] = [
  {
    name: 'add_activity',
    description:
      'Add a new activity to the trip on a specific date. Use this when the user asks to add or create an activity.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Activity name' },
        description: { type: 'string', description: '2–3 sentence description' },
        type: {
          type: 'string',
          enum: [
            'sightseeing',
            'food',
            'adventure',
            'culture',
            'shopping',
            'nightlife',
            'nature',
            'wellness',
          ],
        },
        city: { type: 'string', description: 'City where the activity takes place' },
        scheduledDate: { type: 'string', description: 'YYYY-MM-DD' },
        scheduledTime: { type: 'string', description: 'HH:MM in 24h format, optional' },
        estimatedCost: { type: 'string', description: 'e.g. "$10–20 per person"' },
        duration: { type: 'string', description: 'e.g. "2–3 hours"' },
        tips: { type: 'string', description: 'One practical tip for visitors' },
      },
      required: ['name', 'description', 'type', 'city', 'scheduledDate'],
    },
  },
  {
    name: 'schedule_activity',
    description:
      'Schedule a saved (unscheduled) activity to a specific date and optional time. Use the activity id from the Activities Bank.',
    input_schema: {
      type: 'object',
      properties: {
        activityId: { type: 'string', description: 'The activity id from the Activities Bank' },
        scheduledDate: { type: 'string', description: 'YYYY-MM-DD' },
        scheduledTime: { type: 'string', description: 'HH:MM in 24h format, optional' },
      },
      required: ['activityId', 'scheduledDate'],
    },
  },
  {
    name: 'reschedule_activity',
    description:
      'Move a scheduled activity to a different date or time. Use the activity id from the Activities Bank.',
    input_schema: {
      type: 'object',
      properties: {
        activityId: { type: 'string', description: 'The activity id from the Activities Bank' },
        scheduledDate: { type: 'string', description: 'YYYY-MM-DD' },
        scheduledTime: { type: 'string', description: 'HH:MM in 24h format, optional' },
      },
      required: ['activityId', 'scheduledDate'],
    },
  },
  {
    name: 'remove_activity',
    description:
      'Unschedule an activity (remove it from a specific day but keep it saved) or delete it entirely.',
    input_schema: {
      type: 'object',
      properties: {
        activityId: { type: 'string', description: 'The activity id from the Activities Bank' },
        action: {
          type: 'string',
          enum: ['unschedule', 'delete'],
          description:
            '"unschedule" removes the date/time but keeps the activity saved; "delete" removes it entirely',
        },
      },
      required: ['activityId', 'action'],
    },
  },
  {
    name: 'suggest_activities',
    description:
      'Get activity recommendations for a city. Returns a list of suggestions and automatically saves them to the trip\'s Activities pool so the user can schedule them later. Present the results and offer to schedule specific ones.',
    input_schema: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'City or neighbourhood to get suggestions for' },
        startDate: { type: 'string', description: 'YYYY-MM-DD, optional' },
        endDate: { type: 'string', description: 'YYYY-MM-DD, optional' },
        prompt: { type: 'string', description: "User's specific interest or request, optional" },
      },
      required: ['city'],
    },
  },
  {
    name: 'update_activity',
    description:
      'Update details of an existing activity, including its address or city. Use when the user asks to correct, add, or change location information for a saved activity.',
    input_schema: {
      type: 'object',
      properties: {
        activityId: { type: 'string', description: 'Activity id from the Activities Bank' },
        city: { type: 'string', description: 'Updated city name, optional' },
        address: { type: 'string', description: 'Updated address or neighbourhood, optional' },
      },
      required: ['activityId'],
    },
  },
  {
    name: 'update_timeline_event',
    description:
      'Update the city or address of a timeline event (hotel check-in, activity, etc.). Use when the user asks to correct location information on a confirmed booking event.',
    input_schema: {
      type: 'object',
      properties: {
        eventId: { type: 'string', description: 'Event id from the itinerary (shown as [id] in the itinerary context)' },
        locationCity: { type: 'string', description: 'Updated city, optional' },
        locationAddress: { type: 'string', description: 'Updated address or neighbourhood, optional' },
      },
      required: ['eventId'],
    },
  },
  {
    name: 'verify_address',
    description:
      'Verify the address of an activity or timeline event against Google Maps. ' +
      'Checks if the place is permanently closed and corrects the stored address and coordinates. ' +
      'Use when the user asks to verify, check, or fix an address, or when they say an address looks wrong.',
    input_schema: {
      type: 'object',
      properties: {
        activityId: {
          type: 'string',
          description: 'Activity id from the Activities Bank — provide this OR eventId',
        },
        eventId: {
          type: 'string',
          description: 'Event id from the itinerary — provide this OR activityId',
        },
      },
      required: [],
    },
  },
  {
    name: 'merge_events',
    description:
      'Link a planned activity to a confirmed activity booking (ActivityEvent). Use when the user asks to merge, link, or combine a planned activity with a matching confirmed booking. ' +
      'The activityId comes from the Activities Bank (shown with [id] prefix). ' +
      'The eventId comes from an [ACTIVITY] line in the trip itinerary.',
    input_schema: {
      type: 'object',
      properties: {
        activityId: {
          type: 'string',
          description: 'The id of the planned Activity from the Activities Bank',
        },
        eventId: {
          type: 'string',
          description: 'The id of the ActivityEvent from the itinerary [ACTIVITY] line',
        },
      },
      required: ['activityId', 'eventId'],
    },
  },
  {
    name: 'set_budget_targets',
    description:
      "Update the trip's overall budget goal and/or per-category spending targets. Use this when the user asks to set or adjust their budget. Never use this to change or delete existing expense records.",
    input_schema: {
      type: 'object',
      properties: {
        budgetGoal: {
          type: 'number',
          description:
            "New overall trip budget in the trip's preferred currency. Omit to leave unchanged.",
        },
        categoryGoals: {
          type: 'object',
          description:
            'Per-category spending targets to set or update. Only include categories you want to change — existing categories not listed here are left unchanged.',
          properties: {
            flights: { type: 'number' },
            hotels: { type: 'number' },
            car_rental: { type: 'number' },
            activities: { type: 'number' },
            transport: { type: 'number' },
            food: { type: 'number' },
            insurance: { type: 'number' },
            other: { type: 'number' },
          },
          additionalProperties: false,
        },
      },
      required: [],
    },
  },
];

// ─── Tool execution ───────────────────────────────────────────────────────────

interface ToolExecutionResult {
  content: string;
  mutated: boolean;
}

async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  tripId: string,
  userId: string,
  trip: TripRow,
): Promise<ToolExecutionResult> {
  const tripDestination = trip.destination;
  const tripStartDate = trip.startDate;
  const tripEndDate = trip.endDate;
  if (toolName === 'add_activity') {
    const existing = await loadActivities(tripId);
    const activities: Activity[] = existing?.savedActivities ?? [];
    const destination = existing?.destination ?? tripDestination;

    const newActivity: Activity = {
      id: nanoid(12),
      name: input.name as string,
      description: input.description as string,
      type: input.type as ActivityType,
      city: input.city as string,
      scheduledDate: input.scheduledDate as string,
      scheduledTime: input.scheduledTime as string | undefined,
      estimatedCost: input.estimatedCost as string | undefined,
      duration: input.duration as string | undefined,
      tips: input.tips as string | undefined,
      saved: true,
    };

    const enrichedActivity = await enrichIfMissingAddress(newActivity);

    // Verify via Google Maps: check closure status and get canonical address + coords
    const verification = await verifyPlaceAddress(enrichedActivity.name, enrichedActivity.city ?? '');
    if (verification.permanentlyClosed) {
      return {
        content: JSON.stringify({
          error: 'permanently_closed',
          message: `"${enrichedActivity.name}" appears to be permanently closed according to Google Maps. Please suggest an alternative or ask the user for a different activity.`,
        }),
        mutated: false,
      };
    }
    const verifiedActivity: Activity = {
      ...enrichedActivity,
      ...(verification.found && {
        address: verification.address ?? enrichedActivity.address,
        latitude: verification.lat,
        longitude: verification.lng,
      }),
    };

    await saveActivities(tripId, destination, [...activities, verifiedActivity]);
    return { content: JSON.stringify({ success: true, activity: verifiedActivity }), mutated: true };
  }

  if (toolName === 'schedule_activity' || toolName === 'reschedule_activity') {
    const existing = await loadActivities(tripId);
    const activities: Activity[] = existing?.savedActivities ?? [];
    const destination = existing?.destination ?? tripDestination;
    const idx = activities.findIndex((a) => a.id === input.activityId);

    if (idx === -1) {
      return { content: JSON.stringify({ error: 'Activity not found' }), mutated: false };
    }

    const updated: Activity = {
      ...activities[idx],
      scheduledDate: input.scheduledDate as string,
      scheduledTime: (input.scheduledTime as string | undefined) ?? undefined,
    };
    activities[idx] = await enrichIfMissingAddress(updated);

    await saveActivities(tripId, destination, activities);
    return { content: JSON.stringify({ success: true, activity: activities[idx] }), mutated: true };
  }

  if (toolName === 'remove_activity') {
    const existing = await loadActivities(tripId);
    let activities: Activity[] = existing?.savedActivities ?? [];
    const destination = existing?.destination ?? tripDestination;
    const target = activities.find((a) => a.id === input.activityId);

    if (!target) {
      return { content: JSON.stringify({ error: 'Activity not found' }), mutated: false };
    }

    if (input.action === 'delete') {
      activities = activities.filter((a) => a.id !== input.activityId);
    } else {
      activities = activities.map((a) =>
        a.id === input.activityId
          ? { ...a, scheduledDate: undefined, scheduledTime: undefined }
          : a,
      );
    }

    await saveActivities(tripId, destination, activities);
    return { content: JSON.stringify({ success: true }), mutated: true };
  }

  if (toolName === 'suggest_activities') {
    const city = input.city as string;
    const raw = await suggestActivities(
      city,
      (input.startDate as string | undefined) ?? tripStartDate ?? '',
      (input.endDate as string | undefined) ?? tripEndDate ?? '',
      input.prompt as string | undefined,
    );

    // Remove permanently-closed places via Google Maps Places API
    const suggestions = await filterOpenPlaces(raw, city);

    // Auto-save new suggestions to the activities pool (deduplicated by name)
    const existing = await loadActivities(tripId);
    const poolActivities: Activity[] = existing?.savedActivities ?? [];
    const destination = existing?.destination ?? tripDestination;
    const existingNames = new Set(poolActivities.map((a) => a.name.toLowerCase()));

    const toAdd: Activity[] = suggestions
      .filter((s) => !existingNames.has(s.name.toLowerCase()))
      .map((s) => ({ ...s, id: s.id ?? nanoid(12), saved: true, city: s.city || city }));

    if (toAdd.length > 0) {
      await saveActivities(tripId, destination, [...poolActivities, ...toAdd]);
    }

    // Return saved activities with saved=true and proper IDs so the AI can
    // reference them in subsequent schedule_activity / reschedule_activity calls.
    // For suggestions already in the pool, use their existing pool entry.
    const savedSuggestions: Activity[] = suggestions.map((s) => {
      const existing = poolActivities.find(
        (p) => p.name.toLowerCase() === s.name.toLowerCase(),
      );
      if (existing) return existing;
      return toAdd.find((a) => a.name.toLowerCase() === s.name.toLowerCase()) ?? { ...s, saved: true, city: s.city || city };
    });

    return { content: JSON.stringify({ suggestions: savedSuggestions }), mutated: toAdd.length > 0 };
  }

  if (toolName === 'update_activity') {
    const existing = await loadActivities(tripId);
    const activities: Activity[] = existing?.savedActivities ?? [];
    const destination = existing?.destination ?? tripDestination;
    const idx = activities.findIndex((a) => a.id === input.activityId);
    if (idx === -1) return { content: JSON.stringify({ error: 'Activity not found' }), mutated: false };

    activities[idx] = {
      ...activities[idx],
      ...(input.city !== undefined && { city: input.city as string }),
      ...(input.address !== undefined && { address: input.address as string }),
    };
    await saveActivities(tripId, destination, activities);
    return { content: JSON.stringify({ success: true, activity: activities[idx] }), mutated: true };
  }

  if (toolName === 'update_timeline_event') {
    const timeline = await loadTimeline(tripId);
    const idx = timeline.findIndex((e) => e.id === input.eventId);
    if (idx === -1) return { content: JSON.stringify({ error: 'Event not found' }), mutated: false };

    timeline[idx] = {
      ...timeline[idx],
      ...(input.locationCity !== undefined && { locationCity: input.locationCity as string }),
      ...(input.locationAddress !== undefined && { locationAddress: input.locationAddress as string }),
    } as TimelineEvent;
    await saveTimeline(tripId, timeline);
    return { content: JSON.stringify({ success: true, event: timeline[idx] }), mutated: true };
  }

  if (toolName === 'set_budget_targets') {
    const newGoal = input.budgetGoal as number | undefined;
    const newCategoryGoals = input.categoryGoals as
      | Partial<Record<BudgetItemCategory, number>>
      | undefined;

    const updatedGoal = newGoal !== undefined ? newGoal : trip.budgetGoal;
    const updatedCategoryGoals: Partial<Record<BudgetItemCategory, number>> = {
      ...(trip.categoryGoals ?? {}),
      ...(newCategoryGoals ?? {}),
    };

    await updateBudgetGoals(tripId, userId, updatedGoal ?? null, updatedCategoryGoals);
    return {
      content: JSON.stringify({
        success: true,
        budgetGoal: updatedGoal,
        categoryGoals: updatedCategoryGoals,
      }),
      mutated: true,
    };
  }

  if (toolName === 'verify_address') {
    const activityId = input.activityId as string | undefined;
    const eventId = input.eventId as string | undefined;

    if (activityId) {
      const existing = await loadActivities(tripId);
      const activities: Activity[] = existing?.savedActivities ?? [];
      const destination = existing?.destination ?? tripDestination;
      const idx = activities.findIndex((a) => a.id === activityId);
      if (idx === -1) return { content: JSON.stringify({ error: 'Activity not found' }), mutated: false };

      const activity = activities[idx];
      const verification = await verifyPlaceAddress(activity.name, activity.city ?? '');

      if (!verification.found) {
        return {
          content: JSON.stringify({
            verified: false,
            message: `Could not find "${activity.name}" on Google Maps — address unchanged.`,
          }),
          mutated: false,
        };
      }

      if (verification.permanentlyClosed) {
        return {
          content: JSON.stringify({
            verified: true,
            permanentlyClosed: true,
            message: `"${activity.name}" is marked as permanently closed on Google Maps.`,
            matchedName: verification.matchedName,
          }),
          mutated: false,
        };
      }

      // Apply verified address + coordinates
      activities[idx] = {
        ...activity,
        address: verification.address ?? activity.address,
        latitude: verification.lat,
        longitude: verification.lng,
      };
      await saveActivities(tripId, destination, activities);
      return {
        content: JSON.stringify({
          verified: true,
          permanentlyClosed: false,
          updatedAddress: verification.address,
          matchedName: verification.matchedName,
          message: `Address verified and updated to: ${verification.address}`,
        }),
        mutated: true,
      };
    }

    if (eventId) {
      const timeline = await loadTimeline(tripId);
      const idx = timeline.findIndex((e) => e.id === eventId);
      if (idx === -1) return { content: JSON.stringify({ error: 'Event not found' }), mutated: false };

      const event = timeline[idx];
      // Derive the best search query from the event type
      let searchName = '';
      const searchCity = event.locationCity;
      if (event.type === 'hotel') {
        searchName = (event as import('@/types').HotelCheckInEvent).hotelName;
      } else if (event.type === 'activity') {
        searchName = (event as import('@/types').ActivityEvent).description;
      } else {
        return {
          content: JSON.stringify({
            error: 'Address verification is supported for hotel and activity events only.',
          }),
          mutated: false,
        };
      }

      const verification = await verifyPlaceAddress(searchName, searchCity);

      if (!verification.found) {
        return {
          content: JSON.stringify({
            verified: false,
            message: `Could not find "${searchName}" on Google Maps — address unchanged.`,
          }),
          mutated: false,
        };
      }

      if (verification.permanentlyClosed) {
        return {
          content: JSON.stringify({
            verified: true,
            permanentlyClosed: true,
            message: `"${searchName}" is marked as permanently closed on Google Maps.`,
            matchedName: verification.matchedName,
          }),
          mutated: false,
        };
      }

      timeline[idx] = {
        ...timeline[idx],
        locationAddress: verification.address ?? event.locationAddress,
      } as TimelineEvent;
      await saveTimeline(tripId, timeline);
      return {
        content: JSON.stringify({
          verified: true,
          permanentlyClosed: false,
          updatedAddress: verification.address,
          matchedName: verification.matchedName,
          message: `Address verified and updated to: ${verification.address}`,
        }),
        mutated: true,
      };
    }

    return {
      content: JSON.stringify({ error: 'Provide either activityId or eventId.' }),
      mutated: false,
    };
  }

  if (toolName === 'merge_events') {
    const activityId = input.activityId as string;
    const eventId = input.eventId as string;
    const [activitiesData, timeline] = await Promise.all([loadActivities(tripId), loadTimeline(tripId)]);
    const activities: Activity[] = activitiesData?.savedActivities ?? [];
    const activityIdx = activities.findIndex((a) => a.id === activityId);
    if (activityIdx === -1) return { content: JSON.stringify({ error: 'Activity not found' }), mutated: false };
    const eventIdx = timeline.findIndex((e) => e.id === eventId);
    if (eventIdx === -1) return { content: JSON.stringify({ error: 'Event not found' }), mutated: false };
    const event = timeline[eventIdx];
    if (event.type !== 'activity') {
      return { content: JSON.stringify({ error: 'Event is not an activity booking — only activity-type events can be linked' }), mutated: false };
    }
    const activity = activities[activityIdx];
    if (activity.linkedEventId) {
      return { content: JSON.stringify({ error: `"${activity.name}" is already linked to another event` }), mutated: false };
    }
    if ((event as TimelineEvent & { linkedActivityId?: string }).linkedActivityId) {
      return { content: JSON.stringify({ error: `That event is already linked to another activity` }), mutated: false };
    }
    activities[activityIdx] = { ...activity, linkedEventId: eventId };
    timeline[eventIdx] = { ...event, linkedActivityId: activityId };
    await Promise.all([
      saveActivities(tripId, activitiesData?.destination ?? trip.destination, activities),
      saveTimeline(tripId, timeline),
    ]);
    return {
      content: JSON.stringify({
        success: true,
        message: `Linked "${activity.name}" with "${(event as TimelineEvent & { description?: string }).description ?? event.locationCity}".`,
      }),
      mutated: true,
    };
  }

  return { content: JSON.stringify({ error: `Unknown tool: ${toolName}` }), mutated: false };
}

// ─── agents-web delegation ────────────────────────────────────────────────────

const AGENTS_WEB_URL = process.env.AGENTS_WEB_URL?.trim();
const CHAT_AGENT_ID = process.env.CHAT_AGENT_ID?.trim();
const AGENTS_WEB_API_KEY = process.env.AGENTS_WEB_API_KEY?.trim();

async function handleViaAgentsWeb(params: {
  userId: string;
  tripId: string;
  trip: TripRow;
  body: ChatRequest;
}): Promise<Response> {
  const { userId, tripId, trip, body } = params;
  const { messages: clientMessages, currentDayIndex, currentDate, agentRunId } = body;

  let chatStream;
  if (agentRunId) {
    const latestMessage = clientMessages.filter((m) => m.role === 'user').at(-1)?.content ?? '';
    chatStream = await continueAgentChat({
      agentsWebUrl: AGENTS_WEB_URL!,
      apiKey: AGENTS_WEB_API_KEY!,
      runId: agentRunId,
      message: latestMessage,
    });
  } else {
    const destinations = trip.destinations.length > 0 ? trip.destinations : [trip.destination].filter(Boolean);

    const contextLines = [
      `Trip ID: ${tripId}`,
      `Destinations: ${destinations.join(', ') || 'unknown'}`,
      `Dates: ${trip.startDate ?? '?'} → ${trip.endDate ?? '?'}`,
      ...(currentDate ? [`Currently viewing: ${currentDate}`] : []),
    ];

    const lastUserMessage = clientMessages.filter((m) => m.role === 'user').at(-1)?.content ?? '';
    const task = `## Trip\n${contextLines.join('\n')}\n\n${lastUserMessage}`;

    chatStream = await streamAgentChat({
      agentsWebUrl: AGENTS_WEB_URL!,
      apiKey: AGENTS_WEB_API_KEY!,
      agentId: CHAT_AGENT_ID!,
      userId,
      task,
    });
  }

  const { runId, events } = chatStream;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: ChatSSEEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      try {
        for await (const event of events) {
          send(event);
        }
      } catch (err) {
        send({ type: 'error', message: err instanceof Error ? err.message : 'Unexpected error' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      ...(runId && { 'X-Agent-Run-Id': runId }),
    },
  });
}

// ─── Route handler ────────────────────────────────────────────────────────────

export const POST = withTripAuth(async ({ userId, trip, params, request }) => {
  const { id: tripId } = params;
  const isOwner = trip.userId === userId;

  const body = (await request.json()) as ChatRequest;

  if (AGENTS_WEB_URL && CHAT_AGENT_ID && AGENTS_WEB_API_KEY) {
    return handleViaAgentsWeb({ userId, tripId, trip, body });
  }

  const { messages: clientMessages, currentDayIndex } = body;

  const [timeline, activitiesData] = await Promise.all([
    loadTimeline(tripId),
    loadActivities(tripId),
  ]);

  const { systemPrompt } = buildTripContext({
    trip,
    timeline,
    activities: activitiesData?.savedActivities ?? [],
    currentDayIndex,
  });

  let anthropicMessages: AnthropicChatMessage[] = clientMessages.map((m) => ({
    role: m.role,
    content: m.content,
  })) as AnthropicChatMessage[];

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: ChatSSEEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        for (let turn = 0; turn < 5; turn++) {
          let assistantText = '';
          const toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];

          await streamTripChat(systemPrompt, anthropicMessages, CHAT_TOOLS, (event) => {
            if (event.type === 'text_delta') {
              send({ type: 'text', content: event.text });
              assistantText += event.text;
            } else if (event.type === 'tool_call') {
              toolCalls.push({ id: event.id, name: event.name, input: event.input });
            }
          });

          if (toolCalls.length === 0) break;

          // Build assistant message with all content blocks from this turn
          const assistantBlocks: AnthropicContentBlock[] = [];
          if (assistantText) assistantBlocks.push({ type: 'text', text: assistantText });
          for (const tc of toolCalls) {
            assistantBlocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
          }
          anthropicMessages = [
            ...anthropicMessages,
            { role: 'assistant', content: assistantBlocks },
          ];

          // Execute tools and collect results
          const resultBlocks: AnthropicContentBlock[] = [];
          for (const tc of toolCalls) {
            // Read-only users cannot mutate activities
            if (
              !isOwner &&
              ['add_activity', 'schedule_activity', 'reschedule_activity', 'remove_activity', 'suggest_activities', 'set_budget_targets', 'merge_events'].includes(
                tc.name,
              )
            ) {
              const denied = { error: 'Read-only access — you cannot modify this trip' };
              send({ type: 'tool_result', tool: tc.name, result: denied, mutated: false });
              resultBlocks.push({
                type: 'tool_result',
                tool_use_id: tc.id,
                content: JSON.stringify(denied),
              });
              continue;
            }

            const result = await executeTool(
              tc.name,
              tc.input,
              tripId,
              userId,
              trip,
            );
            const parsed = JSON.parse(result.content) as unknown;
            send({ type: 'tool_result', tool: tc.name, result: parsed, mutated: result.mutated });
            resultBlocks.push({
              type: 'tool_result',
              tool_use_id: tc.id,
              content: result.content,
            });
          }

          anthropicMessages = [
            ...anthropicMessages,
            { role: 'user', content: resultBlocks },
          ];
        }

        send({ type: 'done' });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'An unexpected error occurred';
        send({ type: 'error', message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
});
