import "server-only";

import type { ContextAction, ContextTranscript } from "@/types/meeting-context";
import {
  getKrispTokens,
  saveKrispTokens,
  type KrispTokenRecord,
} from "@/lib/krisp-tokens";

const DEFAULT_MCP_URL = "https://mcp.krisp.ai/mcp";
const DEFAULT_TOKEN_URL =
  "https://api.krisp.ai/platform/v1/oauth2/token";

function mcpUrl(): string {
  return process.env.KRISP_MCP_URL?.trim() || DEFAULT_MCP_URL;
}

function tokenUrl(): string {
  return process.env.KRISP_OAUTH_TOKEN_URL?.trim() || DEFAULT_TOKEN_URL;
}

interface McpToolResult {
  content?: Array<{ type?: string; text?: string }>;
  structuredContent?: unknown;
  isError?: boolean;
}

async function refreshKrispToken(
  userId: string,
  tokens: KrispTokenRecord,
): Promise<KrispTokenRecord | null> {
  if (!tokens.refreshToken || !process.env.KRISP_MCP_CLIENT_ID) {
    return null;
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: tokens.refreshToken,
    client_id: process.env.KRISP_MCP_CLIENT_ID,
  });
  if (process.env.KRISP_MCP_CLIENT_SECRET) {
    body.set("client_secret", process.env.KRISP_MCP_CLIENT_SECRET);
  }

  const res = await fetch(tokenUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) return null;

  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };

  if (!data.access_token) return null;

  const updated: KrispTokenRecord = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? tokens.refreshToken,
    tokenExpiry: data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000).toISOString()
      : tokens.tokenExpiry,
    scope: data.scope ?? tokens.scope,
    updatedAt: new Date().toISOString(),
  };

  await saveKrispTokens(userId, updated);
  return updated;
}

async function getValidKrispTokens(
  userId: string,
): Promise<KrispTokenRecord | null> {
  const tokens = await getKrispTokens(userId);
  if (!tokens) return null;

  if (tokens.tokenExpiry) {
    const expiry = new Date(tokens.tokenExpiry).getTime();
    if (expiry - Date.now() < 60_000) {
      return (await refreshKrispToken(userId, tokens)) ?? tokens;
    }
  }

  return tokens;
}

async function mcpCall(
  accessToken: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown | null> {
  const res = await fetch(mcpUrl(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: { name: toolName, arguments: args },
    }),
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) return null;

  const payload = (await res.json()) as {
    result?: McpToolResult;
    error?: { message?: string };
  };

  if (payload.error) return null;

  const result = payload.result;
  if (result?.structuredContent != null) {
    return result.structuredContent;
  }

  const text = result?.content?.find((c) => c.text)?.text;
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { text };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractMeetings(payload: unknown): Record<string, unknown>[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (!isRecord(payload)) return [];
  for (const key of ["meetings", "results", "items", "data"]) {
    const nested = payload[key];
    if (Array.isArray(nested)) return nested.filter(isRecord);
  }
  return [];
}

function attendeeOverlap(
  meeting: Record<string, unknown>,
  emails: string[],
): number {
  const set = new Set(emails.map((e) => e.toLowerCase()));
  const attendees: string[] = [];

  for (const key of ["attendees", "participants", "emails"]) {
    const val = meeting[key];
    if (Array.isArray(val)) {
      for (const item of val) {
        if (typeof item === "string") attendees.push(item.toLowerCase());
        else if (isRecord(item) && typeof item.email === "string") {
          attendees.push(item.email.toLowerCase());
        }
      }
    }
  }

  return attendees.filter((a) => set.has(a)).length;
}

function scoreMeeting(
  meeting: Record<string, unknown>,
  title: string,
  emails: string[],
): number {
  let score = 0;
  const meetingTitle =
    (typeof meeting.title === "string" && meeting.title) ||
    (typeof meeting.name === "string" && meeting.name) ||
    "";

  if (meetingTitle && title) {
    const a = meetingTitle.toLowerCase();
    const b = title.toLowerCase();
    if (a === b) score += 5;
    else if (a.includes(b) || b.includes(a)) score += 3;
  }

  score += attendeeOverlap(meeting, emails) * 2;
  return score;
}

export async function krispContextForMeeting(
  userId: string,
  input: {
    title: string;
    start?: string | null;
    attendeeEmails: string[];
  },
): Promise<{
  transcripts: ContextTranscript[];
  actions: ContextAction[];
  error?: string;
}> {
  const tokens = await getValidKrispTokens(userId);
  if (!tokens) {
    return {
      transcripts: [],
      actions: [],
      error: "Krisp not connected",
    };
  }

  const searchArgs: Record<string, unknown> = {
    query: input.title,
    limit: 8,
  };

  if (input.start) {
    const start = new Date(input.start);
    const from = new Date(start);
    from.setHours(from.getHours() - 2);
    const to = new Date(start);
    to.setHours(to.getHours() + 4);
    searchArgs.startDate = from.toISOString();
    searchArgs.endDate = to.toISOString();
  }

  const searchResult = await mcpCall(
    tokens.accessToken,
    "search_meetings",
    searchArgs,
  );

  const meetings = extractMeetings(searchResult);
  if (meetings.length === 0) {
    return { transcripts: [], actions: [] };
  }

  const ranked = meetings
    .map((m) => ({ m, score: scoreMeeting(m, input.title, input.attendeeEmails) }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  const confidence: ContextTranscript["confidence"] =
    best.score >= 5 ? "high" : best.score >= 3 ? "medium" : "low";

  const meetingId =
    (typeof best.m.id === "string" && best.m.id) ||
    (typeof best.m.meetingId === "string" && best.m.meetingId) ||
    "krisp-meeting";

  const transcripts: ContextTranscript[] = [];
  const doc = await mcpCall(tokens.accessToken, "get_document", {
    meetingId,
  });

  const excerpt =
    isRecord(doc) && typeof doc.excerpt === "string"
      ? doc.excerpt
      : isRecord(doc) && typeof doc.text === "string"
        ? doc.text.slice(0, 500)
        : typeof doc === "object" && doc !== null
          ? JSON.stringify(doc).slice(0, 400)
          : null;

  transcripts.push({
    id: meetingId,
    title:
      (typeof best.m.title === "string" && best.m.title) ||
      input.title ||
      "Krisp meeting",
    excerpt,
    source: "krisp",
    confidence,
  });

  const actionsResult = await mcpCall(tokens.accessToken, "list_action_items", {
    meetingId,
    status: "open",
  });

  const actionRecords = extractMeetings(actionsResult);
  const actions: ContextAction[] = actionRecords.map((raw, i) => ({
    id:
      (typeof raw.id === "string" && raw.id) ||
      `${meetingId}-action-${i}`,
    title:
      (typeof raw.title === "string" && raw.title) ||
      (typeof raw.text === "string" && raw.text) ||
      "Action item",
    assignee:
      typeof raw.assignee === "string"
        ? raw.assignee
        : isRecord(raw.assignee) && typeof raw.assignee.email === "string"
          ? raw.assignee.email
          : null,
    completed: raw.completed === true || raw.status === "done",
    source: "krisp",
  }));

  return { transcripts, actions };
}
