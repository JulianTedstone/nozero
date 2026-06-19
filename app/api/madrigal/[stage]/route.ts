import { NextResponse } from "next/server";
import { eventEnvelopeSchema } from "@/lib/madrigal/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Activepieces entry point. Each stage transition POSTs the event envelope to
 * /api/madrigal/<stage>; this handler authenticates (shared secret), validates
 * the envelope, and dispatches.
 *
 * STUB: stage handlers are not yet implemented (Phase 1+). Returns 501 with the
 * accepted envelope echoed, so the bus wiring can be tested end-to-end now.
 */
const STAGES = new Set<string>([
  "intake",
  "research",
  "score",
  "adapt",
  "spec",
  "submit",
  "verify",
  "finalize",
  "follow-up",
]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ stage: string }> }
) {
  const secret = process.env.MADRIGAL_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "MADRIGAL_WEBHOOK_SECRET not configured" },
      { status: 503 }
    );
  }
  if (request.headers.get("x-madrigal-secret")?.trim() !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { stage } = await params;
  if (!STAGES.has(stage)) {
    return NextResponse.json(
      { error: `Unknown stage: ${stage}` },
      { status: 404 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = eventEnvelopeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid envelope", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  // TODO(Phase 1+): dispatch parsed.data to the stage handler; advance state via setState().
  return NextResponse.json(
    {
      ok: false,
      stage,
      status: "not_implemented",
      role_uid: parsed.data.role_uid,
    },
    { status: 501 }
  );
}
