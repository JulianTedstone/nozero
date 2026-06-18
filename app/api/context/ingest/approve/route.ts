import { NextResponse } from "next/server";
import { getCurrentAuthUser } from "@/lib/auth-server";
import { getIngestConversation, routeIngestItem } from "@/lib/ingest";
import type { RoutingField, RoutingOp } from "@/lib/routing";
import { resolveStream } from "@/lib/streams";

export const runtime = "nodejs";

const INGEST_REPO = "juliantedstone/context-ingest";

/**
 * Approve/route a staged ingest item. Preferred: `stream` — resolve its
 * repo+subfolder binding and move the note there. Legacy: `slug` — route via the
 * rules.yaml destination and (if corrected) learn a rule.
 */
export async function POST(request: Request) {
  const user = await getCurrentAuthUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { path?: unknown; stream?: unknown; slug?: unknown; learn?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const path = typeof body.path === "string" ? body.path : "";
  if (!path.startsWith("incoming/") || !path.toLowerCase().endsWith(".md")) {
    return NextResponse.json({ error: "Invalid staged path" }, { status: 400 });
  }

  // Stream routing (preferred): move into the stream's repo/subfolder.
  if (typeof body.stream === "string" && body.stream.trim()) {
    const stream = body.stream.trim();
    const binding = await resolveStream(user.id, stream);
    if (!binding) {
      return NextResponse.json({ error: "Unknown stream" }, { status: 400 });
    }
    const result = await routeIngestItem({
      userId: user.id,
      path,
      slug: stream.replace(/^npt-/, "") || stream,
      destRepoPath: `${binding.repo}/${binding.path}`,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error ?? "Route failed" },
        { status: 422 },
      );
    }
    return NextResponse.json({
      ok: true,
      destination: result.destination,
      stream,
    });
  }

  // Legacy slug routing (+ correction learning).
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  if (!slug) {
    return NextResponse.json(
      { error: "stream or slug is required" },
      { status: 400 },
    );
  }

  const conv = await getIngestConversation(user.id, INGEST_REPO, path);
  if (!conv) {
    return NextResponse.json({ error: "Staged item not found" }, { status: 404 });
  }

  const isCorrection = slug !== conv.proposedSlug;
  let correction:
    | { field: RoutingField; op: RoutingOp; value: string }
    | undefined;
  if (isCorrection && body.learn !== false) {
    if (conv.company) {
      correction = { field: "company", op: "contains", value: conv.company.toLowerCase() };
    } else if (conv.meetingId) {
      correction = { field: "meeting_id", op: "equals", value: conv.meetingId };
    }
  }

  const result = await routeIngestItem({
    userId: user.id,
    path,
    slug,
    correction,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Route failed" }, { status: 422 });
  }
  return NextResponse.json({
    ok: true,
    destination: result.destination,
    corrected: isCorrection,
    learned: Boolean(correction),
  });
}
