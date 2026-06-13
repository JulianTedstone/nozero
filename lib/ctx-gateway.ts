/**
 * Server-side client for the gbrain MCP gateway at ctx.nopilot.services.
 * Auth: per-actor bearer via NOZERO_CTX_API_KEY (nozero service principal).
 * @see https://ctx.nopilot.services/sse
 */

const DEFAULT_CTX_BASE = "https://ctx.nopilot.services";

function ctxBaseUrl(): string {
  return process.env.NOZERO_CTX_GATEWAY_URL?.trim() || DEFAULT_CTX_BASE;
}

function ctxBearerHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
  };
  const token = process.env.NOZERO_CTX_API_KEY?.trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export interface CtxIndexHit {
  id: string;
  title: string;
  snippet: string | null;
  repoFullName: string | null;
  path: string | null;
  url: string | null;
  score: number | null;
}

interface GraphContinueNode {
  id: string;
  kind: string;
  title: string;
  preview: string;
}

interface GraphContinueResult {
  confidence?: string;
  recommended_nodes?: GraphContinueNode[];
  error?: string;
}

function tenantFromStreams(streams?: string[]): string {
  if (!streams?.length) return "npt";
  const stream = streams[0]?.toLowerCase() ?? "";
  if (stream.startsWith("npt-") || stream === "npt") return "npt";
  const match = /^([a-z][a-z0-9_]{1,15})/.exec(stream);
  return match?.[1] ?? "npt";
}

function parseMcpResponseBody(body: string): {
  result?: unknown;
  error?: string;
} {
  for (const line of body.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    try {
      const payload = JSON.parse(line.slice(6)) as {
        result?: unknown;
        error?: { message?: string };
      };
      if (payload.error?.message) {
        return { error: payload.error.message };
      }
      if (payload.result !== undefined) {
        return { result: payload.result };
      }
    } catch {
      continue;
    }
  }

  try {
    const payload = JSON.parse(body) as {
      result?: unknown;
      error?: { message?: string };
    };
    if (payload.error?.message) {
      return { error: payload.error.message };
    }
    return { result: payload.result };
  } catch {
    return { error: "Invalid MCP response from ctx gateway" };
  }
}

async function ctxMcpToolCall(
  name: string,
  args: Record<string, unknown>,
): Promise<{ data?: unknown; error?: string }> {
  const base = ctxBaseUrl().replace(/\/$/, "");
  const headers = ctxBearerHeaders();

  if (!headers.Authorization) {
    return { error: "NOZERO_CTX_API_KEY (gbrain actor token) is not set" };
  }

  try {
    const initRes = await fetch(`${base}/sse`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "initialize",
        id: 1,
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "nozero", version: "0" },
        },
      }),
      signal: AbortSignal.timeout(15000),
    });

    const sessionId = initRes.headers.get("mcp-session-id");
    if (!sessionId) {
      return { error: `Ctx MCP initialize ${initRes.status}: missing session` };
    }

    const callRes = await fetch(`${base}/sse`, {
      method: "POST",
      headers: { ...headers, "Mcp-Session-Id": sessionId },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "tools/call",
        id: 2,
        params: { name, arguments: args },
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!callRes.ok) {
      return { error: `Ctx MCP tools/call ${callRes.status}` };
    }

    const parsed = parseMcpResponseBody(await callRes.text());
    if (parsed.error) {
      return { error: parsed.error };
    }

    const result = parsed.result as {
      content?: Array<{ type: string; text?: string }>;
      isError?: boolean;
    };

    const text = result?.content?.find((c) => c.type === "text")?.text;
    if (!text) {
      return { error: "Ctx MCP returned empty tool result" };
    }

    return { data: JSON.parse(text) as unknown };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Ctx MCP request failed",
    };
  }
}

function nodesToHits(nodes: GraphContinueNode[]): CtxIndexHit[] {
  return nodes.map((node) => ({
    id: node.id,
    title: node.title,
    snippet: node.preview?.trim() || null,
    repoFullName: null,
    path: null,
    url: null,
    score: null,
  }));
}

export async function ctxHealth(): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${ctxBaseUrl().replace(/\/$/, "")}/healthz`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return { ok: false, error: `Ctx healthz ${res.status}` };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Ctx gateway unreachable",
    };
  }
}

export async function ctxSearch(input: {
  query: string;
  repos?: string[];
  streams?: string[];
  limit?: number;
}): Promise<{ hits: CtxIndexHit[]; error?: string }> {
  const { data, error } = await ctxMcpToolCall("graph_continue", {
    query: input.query,
    tenant: tenantFromStreams(input.streams),
    max_results: input.limit ?? 15,
  });

  if (error) {
    return { hits: [], error };
  }

  const result = data as GraphContinueResult;
  if (result.error) {
    return { hits: [], error: result.error };
  }

  return { hits: nodesToHits(result.recommended_nodes ?? []) };
}

export async function ctxSummaryForMeeting(input: {
  title: string;
  attendeeEmails: string[];
  repos: string[];
  streams: string[];
}): Promise<{ summary: string | null; sources: string[]; error?: string }> {
  const query = [input.title, ...input.attendeeEmails].filter(Boolean).join(" ");
  const { hits, error } = await ctxSearch({
    query,
    repos: input.repos,
    streams: input.streams,
    limit: 8,
  });
  if (error) {
    return { summary: null, sources: [], error };
  }
  if (hits.length === 0) {
    return { summary: null, sources: [] };
  }
  const snippets = hits
    .map((h) => h.snippet?.trim())
    .filter((s): s is string => Boolean(s))
    .slice(0, 4);
  return {
    summary: snippets.join("\n\n") || null,
    sources: hits.map((h) => h.title).filter(Boolean),
  };
}
