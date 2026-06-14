import "server-only";

import { NextResponse } from "next/server";
import { getCurrentAuthUser } from "@/lib/auth-server";
import {
  flightdeckCommentsEnabled,
  readFlightdeckThread,
} from "@/lib/flightdeck-comments";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getCurrentAuthUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!flightdeckCommentsEnabled()) {
    return NextResponse.json(
      { error: "Comments require GITHUB_TOKEN or Tower credentials" },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const item = url.searchParams.get("item")?.trim();
  const issueUrl = url.searchParams.get("issueUrl")?.trim() || null;

  if (!item) {
    return NextResponse.json({ error: "item is required" }, { status: 400 });
  }

  const thread = await readFlightdeckThread({ itemRef: item, issueUrl });
  return NextResponse.json(thread);
}
