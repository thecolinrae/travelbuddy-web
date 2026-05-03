// Tool names from TravelBuddy's MCP server that mutate state.
// When the agents-web agent calls one of these, we set mutated=true so the
// chat UI knows to refresh trip data.
const MUTATING_TOOLS = new Set([
  'add_activity',
  'schedule_activity',
  'reschedule_activity',
  'remove_activity',
  'update_activity',
  'update_timeline_event',
  'verify_address',
  'merge_events',
  'set_budget_targets',
  'suggest_activities',
  'create_trip',
  'update_trip',
  'add_expense',
]);

export interface AgentChatParams {
  agentsWebUrl: string;
  apiKey: string;
  agentId: string;
  connectorId: string;
  userMcpToken: string;
  task: string;
}

export type ChatSSEEvent =
  | { type: 'text'; content: string }
  | { type: 'tool_result'; tool: string; result: unknown; mutated: boolean }
  | { type: 'error'; message: string }
  | { type: 'done' };

export async function* streamAgentChat(
  params: AgentChatParams,
  signal?: AbortSignal,
): AsyncGenerator<ChatSSEEvent> {
  const { agentsWebUrl, apiKey, agentId, connectorId, userMcpToken, task } = params;

  const response = await fetch(`${agentsWebUrl}/api/v1/runs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      agentId,
      task,
      connectorHeaderOverrides: {
        [connectorId]: { Authorization: `Bearer ${userMcpToken}` },
      },
    }),
    signal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    yield { type: 'error', message: `agents-web error ${response.status}: ${text}` };
    yield { type: 'done' };
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    yield { type: 'error', message: 'No response body from agents-web' };
    yield { type: 'done' };
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (!raw) continue;

        let event: Record<string, unknown>;
        try {
          event = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          continue;
        }

        const mapped = mapEvent(event);
        if (mapped) yield mapped;

        // Stop after terminal events
        if (event.type === 'run_complete' || event.type === 'run_failed') return;
      }
    }
  } finally {
    reader.releaseLock();
  }

  yield { type: 'done' };
}

function mapEvent(event: Record<string, unknown>): ChatSSEEvent | null {
  switch (event.type) {
    case 'text_delta':
      return { type: 'text', content: (event.text as string) ?? '' };

    case 'tool_result':
      return {
        type: 'tool_result',
        tool: (event.toolName as string) ?? '',
        result: event.result,
        mutated: MUTATING_TOOLS.has((event.toolName as string) ?? ''),
      };

    case 'run_failed':
      return { type: 'error', message: (event.error as string) ?? 'Agent run failed' };

    case 'run_complete':
      return { type: 'done' };

    default:
      return null;
  }
}
