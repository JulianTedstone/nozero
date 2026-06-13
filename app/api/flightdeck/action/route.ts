import "server-only";

import { NextResponse } from "next/server";
import { getCurrentAuthUser } from "@/lib/auth-server";
import { towerConfigured, towerRunBoardVerb } from "@/lib/tower-mcp-client";
import type { FlightdeckBoardVerb } from "@/types/flightdeck-board";

export const runtime = "nodejs";
export const maxDuration = 30;

const ALLOWED_VERBS = new Set<FlightdeckBoardVerb>([
  "claim",
  "start",
  "submit_for_review",
  "approve",
  "request_changes",
  "block",
  "unblock",
]);

export async function POST(request: Request) {
  const user = await getCurrentAuthUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!towerConfigured()) {
    return NextResponse.json(
      {
        error:
          "Board actions require NOZERO_TOWER_API_KEY (Tower actor credential).",
      },
      { status: 503 }
    );
  }

  const body = (await request.json()) as {
    verb?: string;
    item?: string;
    comment?: string;
  };

  const verb = body.verb as FlightdeckBoardVerb | undefined;
  const item = body.item?.trim();

  if (!(verb && ALLOWED_VERBS.has(verb))) {
    return NextResponse.json({ error: "Invalid verb" }, { status: 400 });
  }
  if (!item) {
    return NextResponse.json({ error: "item is required" }, { status: 400 });
  }

  const result = await towerRunBoardVerb({
    verb,
    item,
    comment: body.comment,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Action failed" },
      { status: 422 }
    );
  }

  return NextResponse.json({ ok: true, message: result.message });
}
