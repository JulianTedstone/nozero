import "server-only";

import { NextResponse } from "next/server";
import { getCurrentAuthUser } from "@/lib/auth-server";
import { fetchConnectedBundle } from "@/lib/context-connectors/fetch-connected";
import type { ContextBindingsPreferences } from "@/types/context-accounts";

export const runtime = "nodejs";
export const maxDuration = 30;

interface ConnectedRequest {
  stream?: string;
  path?: string | null;
  repo?: string | null;
  contextBindings?: ContextBindingsPreferences | null;
}

export async function POST(request: Request) {
  const user = await getCurrentAuthUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as ConnectedRequest;
  const stream = body.stream?.trim();
  if (!stream) {
    return NextResponse.json({ error: "stream is required" }, { status: 400 });
  }

  try {
    const bundle = await fetchConnectedBundle({
      userId: user.id,
      userEmail: user.email ?? null,
      stream,
      path: body.path ?? null,
      repo: body.repo ?? null,
      contextBindings: body.contextBindings ?? null,
    });

    return NextResponse.json(bundle);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load connected context",
      },
      { status: 500 },
    );
  }
}
