import { NextResponse } from "next/server";
import { getCurrentAuthUser } from "@/lib/auth-server";
import { getIngestConversation, routeIngestItem } from "@/lib/ingest";
import type { RoutingField, RoutingOp } from "@/lib/routing";

export const runtime = "nodejs";

const INGEST_REPO = "juliantedstone/context-ingest";

/**
 * Approve (or correct) a staged ingest item: move it from context-ingest/incoming
 * to the destination scope repo for `slug`. When `slug` differs from the proposed
 * one, derive a learnable signal (company, else meeting_id) so the correction
 * trains the shared rules.
 */
export async function POST(request: Request) {
  const user = await getCurrentAuthUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { path?: unknown; slug?: unknown; learn?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const path = typeof body.path === "string" ? body.path : "";
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  if (!path.startsWith("incoming/") || !path.toLowerCase().endsWith(".md")) {
    return NextResponse.json({ error: "Invalid staged path" }, { status: 400 });
  }
  if (!slug) {
    return NextResponse.json({ error: "slug is required" }, { status: 400 });
  }

  const conv = await getIngestConversation(user.id, INGEST_REPO, path);
  if (!conv) {
    return NextResponse.json({ error: "Staged item not found" }, { status: 404 });
  }

  // A correction is a route to something other than the deterministic proposal.
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
