import "server-only";

import type { ContextSlackMessage } from "@/types/context-connected";

const SLACK_API = "https://slack.com/api";

function slackToken(): string | null {
  return process.env.SLACK_BOT_TOKEN?.trim() || null;
}

export function slackConfigured(): boolean {
  return Boolean(slackToken());
}

async function slackApi<T>(
  method: string,
  body: Record<string, string | number>,
): Promise<{ ok: boolean; data?: T; error?: string }> {
  const token = slackToken();
  if (!token) {
    return { ok: false, error: "SLACK_BOT_TOKEN not configured" };
  }

  try {
    const res = await fetch(`${SLACK_API}/${method}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(
        Object.entries(body).map(([k, v]) => [k, String(v)]),
      ),
      signal: AbortSignal.timeout(12_000),
    });

    const payload = (await res.json()) as {
      ok?: boolean;
      error?: string;
      messages?: {
        matches?: Array<{
          ts?: string;
          text?: string;
          username?: string;
          permalink?: string;
          channel?: { id?: string; name?: string };
        }>;
      };
    };

    if (!payload.ok) {
      return {
        ok: false,
        error: payload.error ?? `Slack ${method} failed`,
      };
    }

    return { ok: true, data: payload as T };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Slack request failed",
    };
  }
}

export async function searchSlackMessages(input: {
  query: string;
  limit?: number;
}): Promise<{ messages: ContextSlackMessage[]; error?: string }> {
  const trimmed = input.query.trim();
  if (!trimmed) {
    return { messages: [] };
  }

  const { ok, data, error } = await slackApi<{
    messages?: {
      matches?: Array<{
        ts?: string;
        text?: string;
        username?: string;
        permalink?: string;
        channel?: { id?: string; name?: string };
      }>;
    };
  }>("search.messages", {
    query: trimmed,
    count: input.limit ?? 12,
    sort: "timestamp",
    sort_dir: "desc",
  });

  if (!ok || !data) {
    return { messages: [], error };
  }

  const matches = data.messages?.matches ?? [];
  const messages: ContextSlackMessage[] = matches
    .map((match, index) => {
      const channelId = match.channel?.id ?? `unknown-${index}`;
      const text = match.text?.trim() ?? "";
      if (!text) {
        return null;
      }
      return {
        id: `${channelId}:${match.ts ?? index}`,
        channelId,
        channelName: match.channel?.name ?? null,
        text: text.slice(0, 280),
        userName: match.username ?? null,
        permalink: match.permalink ?? null,
        timestamp: match.ts
          ? new Date(Number(match.ts) * 1000).toISOString()
          : null,
      };
    })
    .filter((m): m is ContextSlackMessage => m !== null);

  return { messages };
}
