import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const FO_URL = process.env.WAJO_MCP_URL ?? "https://mcp.api.wajo.ai/fo";

export interface FoResult {
  response: string;
  status: "complete" | "working" | "failed" | "needs_clarification";
  conversationId: string;
  progress?: string;
}

async function createClient(): Promise<Client> {
  const headers: Record<string, string> = {};
  if (process.env.WAJO_TOKEN) {
    headers["Authorization"] = `Bearer ${process.env.WAJO_TOKEN}`;
  }

  const transport = new StreamableHTTPClientTransport(new URL(FO_URL), {
    requestInit: { headers },
  });

  const client = new Client(
    { name: "aveloop", version: "1.0.0" },
    { capabilities: {} }
  );
  await client.connect(transport);
  return client;
}

function parseResult(content: unknown): FoResult {
  const blocks = content as Array<{ type: string; text?: string }>;
  const text = blocks?.find((b) => b.type === "text")?.text ?? "{}";
  return JSON.parse(text) as FoResult;
}

export async function askFo(
  message: string,
  opts: { conversationId?: string; newConversation?: boolean } = {}
): Promise<FoResult> {
  const client = await createClient();
  try {
    const args: Record<string, unknown> = { message };
    if (opts.conversationId) args.conversationId = opts.conversationId;
    if (opts.newConversation) args.newConversation = true;

    const result = await client.callTool({ name: "ask_fo", arguments: args });
    return parseResult(result.content);
  } finally {
    await client.close();
  }
}

export async function getFoReply(conversationId: string): Promise<FoResult> {
  const client = await createClient();
  try {
    const result = await client.callTool({
      name: "get_fo_reply",
      arguments: { conversationId, waitSeconds: 30 },
    });
    return parseResult(result.content);
  } finally {
    await client.close();
  }
}

// Poll Fo until complete or failed (max ~90 seconds)
export async function pollUntilDone(conversationId: string): Promise<FoResult> {
  const MAX_POLLS = 3;
  let reply: FoResult = { response: "", status: "working", conversationId };

  for (let i = 0; i < MAX_POLLS; i++) {
    reply = await getFoReply(conversationId);
    if (reply.status !== "working") break;
  }

  return reply;
}
