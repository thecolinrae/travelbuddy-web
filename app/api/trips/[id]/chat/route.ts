import { auth } from '@/lib/auth';
import { getTrip, loadTimeline, loadActivities, saveActivities, updateBudgetGoals } from '@/services/db';
import { buildTripContext } from '@/services/tripContext';
import {
  streamTripChat,
  suggestActivities,
  enrichActivity,
  type ChatToolDefinition,
  type AnthropicChatMessage,
  type AnthropicContentBlock,
} from '@/services/claude';
import { filterOpenPlaces } from '@/services/places';
import { nanoid } from '@/services/nanoid';
import type { Activity, ActivityType, BudgetItemCategory } from '@/types';
import type { TripRow } from '@/services/db';

// ─── Request / SSE event types ────────────────────────────────────────────────

interface ChatRequest {
  messages: { role: 'user' | 'assistant'; content: string }[];
  currentDayIndex: number;
}

type ChatSSEEvent =
  | { type: 'text'; content: string }
  | { type: 'tool_result'; tool: string; result: unknown; mutated: boolean }
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

/** Enrich an activity in-place if it has no address yet. Non-fatal. */
async function enrichIfMissingAddress(activity: Activity): Promise<Activity> {
  if (activity.address) return activity;
  try {
    const enriched = await enrichActivity(activity.name, activity.city ?? '');
    return {
      ...activity,
      description: activity.description || enriched.description || activity.description,
      type: activity.type || enriched.type || activity.type,
      estimatedCost: activity.estimatedCost ?? enriched.estimatedCost,
      duration: activity.duration ?? enriched.duration,
      bestTime: activity.bestTime ?? enriched.bestTime,
      tips: activity.tips ?? enriched.tips,
      familyFriendly: activity.familyFriendly ?? enriched.familyFriendly,
      highlights: activity.highlights ?? enriched.highlights,
      address: enriched.locationAddress,
      city: activity.city || enriched.city || activity.city,
    };
  } catch {
    return activity;
  }
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
    await saveActivities(tripId, destination, [...activities, enrichedActivity]);
    return { content: JSON.stringify({ success: true, activity: enrichedActivity }), mutated: true };
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

  return { content: JSON.stringify({ error: `Unknown tool: ${toolName}` }), mutated: false };
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const userId = (session as { userId?: string })?.userId;
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: tripId } = await params;
  const trip = await getTrip(tripId, userId);
  if (!trip) return Response.json({ error: 'Not found' }, { status: 404 });

  const isOwner = trip.userId === userId;

  const body = (await request.json()) as ChatRequest;
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
              ['add_activity', 'schedule_activity', 'reschedule_activity', 'remove_activity', 'suggest_activities', 'set_budget_targets'].includes(
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
}
