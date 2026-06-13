import "server-only";

import { NextResponse } from "next/server";
import { getCurrentAuthUser } from "@/lib/auth-server";
import { listStoredThreads } from "@/lib/email-store";
import type { EmailFilterTab } from "@/types/email";

export const runtime = "nodejs";
export const maxDuration = 60;

function parseFilter(raw: string | null): EmailFilterTab {
  if (raw === "unread" || raw === "tracking" || raw === "all") return raw;
  return "all";
}

export async function GET(request: Request) {
  const user = await getCurrentAuthUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const filter = parseFilter(searchParams.get("filter"));
  const q = searchParams.get("q") ?? undefined;
  const stream = searchParams.get("stream") ?? undefined;
  const cursor = searchParams.get("cursor") ?? undefined;
  const sync = searchParams.get("sync") === "true";
  const limitRaw = Number(searchParams.get("limit"));
  const limit = Number.isFinite(limitRaw) ? limitRaw : 20;

  const { threads, nextCursor, error } = await listStoredThreads({
    userId: user.id,
    filter,
    q,
    stream,
    cursor,
    limit,
    sync,
  });

  return NextResponse.json({ threads, nextCursor, error });
}
