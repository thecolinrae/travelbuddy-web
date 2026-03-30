import { auth } from '@/lib/auth';
import { getTrip, loadTimeline, loadActivities, saveActivities } from '@/services/db';
import { buildTripContext } from '@/services/tripContext';
import {
  streamTripChat,
  suggestActivities,
  type ChatToolDefinition,
  type AnthropicChatMessage,
  type AnthropicContentBlock,
} from '@/services/claude';
import { nanoid } from '@/services/nanoid';
import type { Activity, ActivityType } from '@/types';

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
      'Get activity recommendations for a city. Returns a list of suggestions — does not automatically save them. Present the results and offer to add specific ones.',
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
  tripDestination: string,
  tripStartDate: string | null,
  tripEndDate: string | null,
): Promise<ToolExecutionResult> {
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

    await saveActivities(tripId, destination, [...activities, newActivity]);
    return { content: JSON.stringify({ success: true, activity: newActivity }), mutated: true };
  }

  if (toolName === 'schedule_activity' || toolName === 'reschedule_activity') {
    const existing = await loadActivities(tripId);
    const activities: Activity[] = existing?.savedActivities ?? [];
    const destination = existing?.destination ?? tripDestination;
    const idx = activities.findIndex((a) => a.id === input.activityId);

    if (idx === -1) {
      return { content: JSON.stringify({ error: 'Activity not found' }), mutated: false };
    }

    activities[idx] = {
      ...activities[idx],
      scheduledDate: input.scheduledDate as string,
      scheduledTime: (input.scheduledTime as string | undefined) ?? undefined,
    };

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
    const suggestions = await suggestActivities(
      input.city as string,
      (input.startDate as string | undefined) ?? tripStartDate ?? '',
      (input.endDate as string | undefined) ?? tripEndDate ?? '',
      input.prompt as string | undefined,
    );
    return { content: JSON.stringify({ suggestions }), mutated: false };
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

          for await (const event of streamTripChat(systemPrompt, anthropicMessages, CHAT_TOOLS)) {
            if (event.type === 'text_delta') {
              send({ type: 'text', content: event.text });
              assistantText += event.text;
            } else if (event.type === 'tool_call') {
              toolCalls.push({ id: event.id, name: event.name, input: event.input });
            }
          }

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
              ['add_activity', 'schedule_activity', 'reschedule_activity', 'remove_activity'].includes(
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
              trip.destination,
              trip.startDate,
              trip.endDate,
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
