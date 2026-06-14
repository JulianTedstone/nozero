import "server-only";

import {
  githubCommentsEnabled,
  parseIssueFromUrl,
} from "@/lib/flightdeck-client";
import { towerConfigured, towerReadThread } from "@/lib/tower-mcp-client";
import type {
  FlightdeckComment,
  FlightdeckThreadPayload,
} from "@/types/flightdeck-comments";

function githubToken(): string | null {
  return process.env.GITHUB_TOKEN?.trim() || null;
}

async function githubIssueComments(input: {
  owner: string;
  repo: string;
  number: number;
}): Promise<FlightdeckComment[]> {
  const token = githubToken();
  if (!token) return [];

  const res = await fetch(
    `https://api.github.com/repos/${input.owner}/${input.repo}/issues/${input.number}/comments?per_page=100`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
      signal: AbortSignal.timeout(20000),
    },
  );

  if (!res.ok) {
    throw new Error(`GitHub comments HTTP ${res.status}`);
  }

  const data = (await res.json()) as Array<{
    user?: { login?: string };
    body?: string;
    created_at?: string;
  }>;

  return data
    .filter((entry) => entry.body?.trim())
    .map((entry) => ({
      author: entry.user?.login ?? "unknown",
      body: entry.body?.trim() ?? "",
      createdAt: entry.created_at ?? new Date(0).toISOString(),
    }));
}

export async function readFlightdeckThread(input: {
  itemRef: string;
  issueUrl?: string | null;
}): Promise<FlightdeckThreadPayload> {
  if (towerConfigured()) {
    const tower = await towerReadThread(input.itemRef);
    if (tower.comments.length > 0 || !tower.error) {
      return tower;
    }
  }

  const issue = parseIssueFromUrl(input.issueUrl);
  if (!issue || !githubCommentsEnabled()) {
    return {
      comments: [],
      error: towerConfigured()
        ? undefined
        : "Comments require GITHUB_TOKEN or Tower credentials",
    };
  }

  try {
    const comments = await githubIssueComments(issue);
    return { comments };
  } catch (error) {
    return {
      comments: [],
      error: error instanceof Error ? error.message : "Comment load failed",
    };
  }
}

export async function postFlightdeckComment(input: {
  itemRef: string;
  issueUrl?: string | null;
  body: string;
}): Promise<{ ok: boolean; error?: string }> {
  const body = input.body.trim();
  if (!body) {
    return { ok: false, error: "Comment body required" };
  }

  const issue = parseIssueFromUrl(input.issueUrl);
  if (!issue) {
    return { ok: false, error: "Issue URL missing for this item" };
  }

  const token = githubToken();
  if (!token) {
    return { ok: false, error: "GITHUB_TOKEN not configured" };
  }

  const res = await fetch(
    `https://api.github.com/repos/${issue.owner}/${issue.repo}/issues/${issue.number}/comments`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ body }),
      signal: AbortSignal.timeout(20000),
    },
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return {
      ok: false,
      error: detail || `GitHub comment POST ${res.status}`,
    };
  }

  return { ok: true };
}

export function flightdeckCommentsEnabled(): boolean {
  return githubCommentsEnabled() || towerConfigured();
}
