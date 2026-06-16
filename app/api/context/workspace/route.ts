import { NextResponse } from "next/server";
import { getCurrentAuthUser } from "@/lib/auth-server";
import {
  patchUserPreferences,
  readUserPreferences,
} from "@/lib/user-preferences";

type ContextWorkspaceFile = {
  path: string;
  content: string;
  updatedAt: string;
};

type ContextWorkspaceStream = {
  summary: string;
  files: ContextWorkspaceFile[];
  updatedAt: string;
};

type ContextWorkspace = {
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

function coerceWorkspace(raw: unknown): ContextWorkspace {
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

function validateFile(path: string, content: string): string | null {
  if (!path.trim()) {
    return "File path is required.";
  }
  if (path.includes("..")) {
    return "File path cannot include '..'.";
  }
  if (content.includes("\u0000")) {
    return "File contains invalid characters.";
  }
  const lower = path.toLowerCase();

  if (lower.endsWith(".json")) {
    try {
      JSON.parse(content);
    } catch {
      return "Invalid JSON.";
    }
  }

  if (lower.endsWith(".csv")) {
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter(Boolean);
    const width = lines[0]?.split(",").length ?? 0;
    if (width > 0) {
      const malformed = lines.some((line) => line.split(",").length !== width);
      if (malformed) {
        return "Invalid CSV: rows have inconsistent column counts.";
      }
    }
  }

  if (
    (lower.endsWith(".yaml") || lower.endsWith(".yml")) &&
    /\t/.test(content)
  ) {
    return "Invalid YAML: use spaces, not tabs, for indentation.";
  }

  return null;
}

export async function GET() {
  const user = await getCurrentAuthUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const prefs = await readUserPreferences(user.id);
  const workspace = coerceWorkspace(prefs.contextWorkspace);
  return NextResponse.json({ workspace });
}

export async function PUT(request: Request) {
  const user = await getCurrentAuthUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    stream: string;
    path: string;
    content: string;
    summary?: string;
  };
  const stream = body.stream?.trim();
  const path = body.path?.trim();
  const content = body.content ?? "";
  if (!(stream && path)) {
    return NextResponse.json(
      { error: "Stream and file path are required." },
      { status: 400 }
    );
  }

  const validationError = validateFile(path, content);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const prefs = await readUserPreferences(user.id);
  const workspace = coerceWorkspace(prefs.contextWorkspace);
  const now = new Date().toISOString();
  const currentStream = workspace.streams[stream] ?? {
    summary: body.summary?.trim() || `Context for ${stream}`,
    files: [],
    updatedAt: now,
  };
  const existingIndex = currentStream.files.findIndex(
    (file) => file.path === path
  );
  const action = existingIndex >= 0 ? "updated" : "created";

  const nextFile: ContextWorkspaceFile = { path, content, updatedAt: now };
  const nextFiles =
    existingIndex >= 0
      ? currentStream.files.map((file, index) =>
          index === existingIndex ? nextFile : file
        )
      : [...currentStream.files, nextFile];
  nextFiles.sort((a, b) => a.path.localeCompare(b.path));

  workspace.streams[stream] = {
    ...currentStream,
    summary: body.summary?.trim() || currentStream.summary,
    files: nextFiles,
    updatedAt: now,
  };
  workspace.updates = [
    { stream, path, action, at: now },
    ...workspace.updates,
  ].slice(0, 100);

  await patchUserPreferences(user.id, { contextWorkspace: workspace });
  return NextResponse.json({ ok: true, workspace, action });
}
