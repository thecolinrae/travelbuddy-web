import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp';
import { verifyMcpToken } from '@/lib/mcp-token';
import { verifyAuthHubToken } from '@/lib/auth-hub-jwt';
import { createMcpServer } from '@/lib/mcp-server';

export async function POST(request: Request): Promise<Response> {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  let userId = token ? verifyMcpToken(token) : null;
  if (!userId && token) userId = await verifyAuthHubToken(token);

  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const server = createMcpServer(userId);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless — new transport per request
    enableJsonResponse: true,
  });

  await server.connect(transport);
  return transport.handleRequest(request);
}
