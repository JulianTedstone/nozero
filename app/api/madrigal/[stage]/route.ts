import { NextResponse } from "next/server";
import { runAdapt } from "@/lib/madrigal/stages/adapt";
import { runGate } from "@/lib/madrigal/stages/gate";
import { runIntake } from "@/lib/madrigal/stages/intake";
import { runResearch } from "@/lib/madrigal/stages/research";
import { runScore } from "@/lib/madrigal/stages/score";
import { runSpec } from "@/lib/madrigal/stages/spec";
import { eventEnvelopeSchema } from "@/lib/madrigal/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Activepieces entry point. Each stage transition POSTs the event envelope to
 * /api/madrigal/<stage>; this handler authenticates (shared secret), validates
 * the envelope, and dispatches.
 *
 * intake/research/score/gate/adapt/spec are implemented; submit/verify/finalize/
 * follow-up still return 501. Stages are re-entrant — Activepieces re-invokes
 * until the body status is terminal (done/failed/applying/disqualified).
 */
const STAGES = new Set<string>([
  "intake",
  "research",
  "score",
  "gate",
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

  const { payload, role_uid } = parsed.data;

  try {
    switch (stage) {
      case "intake": {
        const result = await runIntake({
          applicationUrl: String(payload.applicationUrl ?? ""),
          companySlug: String(payload.companySlug ?? ""),
          jdUrl: String(payload.jdUrl ?? ""),
          roleSlug: String(payload.roleSlug ?? ""),
          roleUid: role_uid,
          title: String(payload.title ?? ""),
        });
        return NextResponse.json({ ok: true, stage, ...result });
      }
      case "research":
        return NextResponse.json({
          ok: true,
          stage,
          ...(await runResearch(role_uid)),
        });
      case "score":
        return NextResponse.json({
          ok: true,
          stage,
          ...(await runScore(role_uid)),
        });
      case "gate":
        return NextResponse.json({
          ok: true,
          stage,
          ...(await runGate(role_uid)),
        });
      case "adapt":
        return NextResponse.json({
          ok: true,
          stage,
          ...(await runAdapt(role_uid)),
        });
      case "spec":
        return NextResponse.json({
          ok: true,
          stage,
          ...(await runSpec(role_uid)),
        });
      default:
        return NextResponse.json(
          { error: `Stage not implemented: ${stage}`, stage },
          { status: 501 }
        );
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Stage failed", stage },
      { status: 500 }
    );
  }
}
