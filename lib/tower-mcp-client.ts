import "server-only";

import type {
  FlightdeckBoardItem,
  FlightdeckBoardVerb,
} from "@/types/flightdeck-board";
import { towerBaseUrl, towerGatewayHeaders } from "@/lib/tower-gateway";

const MCP_PATH = "/mcp";

interface McpTextContent {
  type: "text";
  text: string;
}

interface McpToolResult {
  content?: McpTextContent[];
  isError?: boolean;
}

function parseTowerItems(text: string): FlightdeckBoardItem[] {
  try {
    const parsed = JSON.parse(text) as Array<Record<string, unknown>>;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((row) => ({
      id: String(row.ref ?? row.id ?? ""),
      ref: row.ref != null ? String(row.ref) : null,
      title: String(row.title ?? "Untitled"),
      status: String(row.status ?? "Backlog"),
      stream: row.stream ? String(row.stream) : null,
      owner: row.owner ? String(row.owner) : null,
      approval: row.approval ? String(row.approval) : null,
      approver: row.approver ? String(row.approver) : null,
      type: row.type ? String(row.type) : null,
      priority: row.priority ? String(row.priority) : null,
      url: row.url ? String(row.url) : null,
      body: row.body ? String(row.body) : null,
    }));
  } catch {
    return [];
  }
}

async function mcpRequest(
  sessionId: string | null,
  body: Record<string, unknown>,
): Promise<{ sessionId: string | null; data: unknown }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    ...(towerGatewayHeaders() as Record<string, string>),
  };
  if (sessionId) {
    headers["mcp-session-id"] = sessionId;
  }

  const res = await fetch(`${towerBaseUrl()}${MCP_PATH}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });

  const nextSession = res.headers.get("mcp-session-id") ?? sessionId;
  const data = (await res.json()) as {
    result?: McpToolResult | Record<string, unknown>;
    error?: { message?: string };
  };

  if (data.error?.message) {
    throw new Error(data.error.message);
  }

  return { sessionId: nextSession, data: data.result };
}

async function withTowerSession<T>(
  run: (sessionId: string) => Promise<T>,
): Promise<T> {
  let sessionId: string | null = null;

  const init = await mcpRequest(null, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "nozero", version: "1.0.0" },
    },
  });
  sessionId = init.sessionId;

  await mcpRequest(sessionId, {
    jsonrpc: "2.0",
    method: "notifications/initialized",
    params: {},
  });

  if (!sessionId) {
    throw new Error("Tower MCP session missing");
  }

  return run(sessionId);
}

async function callTowerTool(
  sessionId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<McpToolResult> {
  const { data } = await mcpRequest(sessionId, {
    jsonrpc: "2.0",
    id: Date.now(),
    method: "tools/call",
    params: { name, arguments: args },
  });

  const result = data as McpToolResult;
  if (result?.isError) {
    const msg = result.content?.[0]?.text ?? "Tower tool failed";
    throw new Error(msg);
  }
  return result;
}

export function towerConfigured(): boolean {
  const headers = towerGatewayHeaders() as Record<string, string>;
  return Boolean(headers.Authorization);
}

export async function towerQueryBoard(): Promise<{
  items: FlightdeckBoardItem[];
  error?: string;
}> {
  if (!towerConfigured()) {
    return { items: [], error: "NOZERO_TOWER_API_KEY not configured" };
  }

  try {
    const items = await withTowerSession(async (sessionId) => {
      const result = await callTowerTool(sessionId, "flightdeck_query", {});
      const text = result.content?.[0]?.text ?? "[]";
      return parseTowerItems(text);
    });
    return { items };
  } catch (error) {
    return {
      items: [],
      error: error instanceof Error ? error.message : "Tower query failed",
    };
  }
}

const VERB_TO_TOOL: Record<FlightdeckBoardVerb, string> = {
  claim: "flightdeck_claim",
  start: "flightdeck_start",
  submit_for_review: "flightdeck_submit_for_review",
  approve: "flightdeck_approve",
  request_changes: "flightdeck_request_changes",
  block: "flightdeck_block",
  unblock: "flightdeck_unblock",
};

export async function towerEnsureStream(input: {
  name: string;
}): Promise<{ ok: boolean; stream?: string; error?: string }> {
  if (!towerConfigured()) {
    return { ok: false, error: "NOZERO_TOWER_API_KEY not configured" };
  }

  const name = input.name.trim();
  if (!name) {
    return { ok: false, error: "Stream name required" };
  }

  try {
    const result = await withTowerSession(async (sessionId) => {
      return callTowerTool(sessionId, "flightdeck_ensure_stream", { name });
    });
    const text = result.content?.[0]?.text?.trim();
    return { ok: true, stream: text || name };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Ensure stream failed",
    };
  }
}

export async function towerRunBoardVerb(input: {
  verb: FlightdeckBoardVerb;
  item: string;
  comment?: string;
}): Promise<{ ok: boolean; message?: string; error?: string }> {
  if (!towerConfigured()) {
    return { ok: false, error: "NOZERO_TOWER_API_KEY not configured" };
  }

  const tool = VERB_TO_TOOL[input.verb];
  const args: Record<string, unknown> = { item: input.item };
  if (input.comment?.trim()) {
    args.comment = input.comment.trim();
  }

  try {
    await withTowerSession(async (sessionId) => {
      await callTowerTool(sessionId, tool, args);
    });
    return { ok: true, message: `${input.verb} succeeded` };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Tower action failed",
    };
  }
}
