/**
 * Server-side client for Tower MCP gateway (Flightdeck rules, streams, tasks).
 * @see https://tower.nopilot.services
 */

const DEFAULT_TOWER_BASE = "https://tower.nopilot.services";

function towerBaseUrl(): string {
  return process.env.NOZERO_TOWER_GATEWAY_URL?.trim() || DEFAULT_TOWER_BASE;
}

export { towerBaseUrl };

export function towerGatewayHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  const token = process.env.NOZERO_TOWER_API_KEY?.trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function towerHeaders(): HeadersInit {
  return towerGatewayHeaders();
}

export interface TowerStreamInfo {
  id: string;
  name: string;
  repoFullName?: string;
}

export interface TowerTaskItem {
  id: string;
  status: string | null;
  stream: string | null;
  title: string;
  url: string | null;
}

export async function towerHealth(): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${towerBaseUrl()}/health`, {
      headers: towerHeaders(),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return { ok: false, error: `Tower health ${res.status}` };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Tower unreachable",
    };
  }
}

export async function towerStreamsForRepo(
  repoFullName: string
): Promise<{ streams: TowerStreamInfo[]; error?: string }> {
  try {
    const res = await fetch(`${towerBaseUrl()}/api/streams`, {
      method: "POST",
      headers: towerHeaders(),
      body: JSON.stringify({ repo: repoFullName }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      return {
        streams: [],
        error: `Tower streams ${res.status}`,
      };
    }
    const data = (await res.json()) as { streams?: TowerStreamInfo[] };
    return { streams: data.streams ?? [] };
  } catch (error) {
    return {
      streams: [],
      error: error instanceof Error ? error.message : "Tower streams failed",
    };
  }
}

export async function towerSearchTasks(input: {
  query: string;
  streams?: string[];
  participantEmails?: string[];
  limit?: number;
}): Promise<{ tasks: TowerTaskItem[]; error?: string }> {
  try {
    const res = await fetch(`${towerBaseUrl()}/api/tasks/search`, {
      method: "POST",
      headers: towerHeaders(),
      body: JSON.stringify({
        query: input.query,
        streams: input.streams,
        participantEmails: input.participantEmails,
        limit: input.limit ?? 20,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      return { tasks: [], error: `Tower tasks ${res.status}` };
    }
    const data = (await res.json()) as { tasks?: TowerTaskItem[] };
    return { tasks: data.tasks ?? [] };
  } catch (error) {
    return {
      tasks: [],
      error: error instanceof Error ? error.message : "Tower tasks failed",
    };
  }
}
