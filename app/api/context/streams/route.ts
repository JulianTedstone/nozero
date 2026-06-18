import { NextResponse } from "next/server";
import { getCurrentAuthUser } from "@/lib/auth-server";
import { addStream, CONTEXT_REPOS, listStreams } from "@/lib/streams";
import { towerConfigured, towerEnsureStream } from "@/lib/tower-mcp-client";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentAuthUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const streams = await listStreams(user.id);
  return NextResponse.json({ streams, repos: CONTEXT_REPOS });
}

export async function POST(request: Request) {
  const user = await getCurrentAuthUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { name?: unknown; repo?: unknown; path?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const repo = typeof body.repo === "string" ? body.repo.trim() : "";
  const path = typeof body.path === "string" ? body.path.trim() : "";

  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    return NextResponse.json(
      { error: "Stream name must be kebab-case (e.g. npt-new-project)" },
      { status: 400 },
    );
  }
  if (!CONTEXT_REPOS.includes(repo)) {
    return NextResponse.json({ error: "Unknown repo" }, { status: 400 });
  }
  if (!path) {
    return NextResponse.json({ error: "Subfolder is required" }, { status: 400 });
  }

  const streams = await addStream(user.id, { name, repo, path });

  // Best-effort: ensure the Flightdeck lane exists so tasks can be assigned to it.
  if (towerConfigured()) {
    try {
      await towerEnsureStream({ name });
    } catch {
      // non-fatal — the binding is saved; the lane can be created on first task
    }
  }

  return NextResponse.json({ ok: true, streams });
}
