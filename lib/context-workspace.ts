import "server-only";

import { readUserPreferences } from "@/lib/user-preferences";

export type ContextWorkspaceFile = {
  path: string;
  content: string;
  updatedAt: string;
};

export type ContextWorkspaceStream = {
  summary: string;
  files: ContextWorkspaceFile[];
  updatedAt: string;
};

export type ContextWorkspace = {
  streams: Record<string, ContextWorkspaceStream>;
  updates: Array<{
    stream: string;
    path: string;
    action: "created" | "updated";
    at: string;
  }>;
};

function emptyWorkspace(): ContextWorkspace {
  return { streams: {}, updates: [] };
}

export function coerceContextWorkspace(raw: unknown): ContextWorkspace {
  if (!raw || typeof raw !== "object") {
    return emptyWorkspace();
  }
  const value = raw as Partial<ContextWorkspace>;
  return {
    streams:
      value.streams && typeof value.streams === "object" ? value.streams : {},
    updates: Array.isArray(value.updates) ? value.updates : [],
  };
}

export async function readContextWorkspace(
  userId: string,
): Promise<ContextWorkspace> {
  const prefs = await readUserPreferences(userId);
  return coerceContextWorkspace(prefs.contextWorkspace);
}

export function fileContentFromWorkspace(
  workspace: ContextWorkspace,
  stream: string,
  path: string | null | undefined,
): string | null {
  if (!path?.trim()) {
    return null;
  }
  const file = workspace.streams[stream]?.files.find((f) => f.path === path);
  return file?.content ?? null;
}
