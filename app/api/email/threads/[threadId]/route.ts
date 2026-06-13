import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentAuthUser } from "@/lib/auth-server";
import { getStoredThread, patchStoredThread } from "@/lib/email-store";

export const runtime = "nodejs";
export const maxDuration = 60;

const patchSchema = z.object({
  accountEmail: z.string().email().optional(),
  isUnread: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  isTracking: z.boolean().optional(),
  streams: z.array(z.string()).optional(),
  threadIntent: z.string().optional(),
});

export async function GET(
  request: Request,
  context: { params: Promise<{ threadId: string }> },
) {
  const user = await getCurrentAuthUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { threadId } = await context.params;
  const decoded = decodeURIComponent(threadId?.trim() ?? "");
  if (!decoded) {
    return NextResponse.json({ error: "Missing thread id" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const accountEmail = searchParams.get("accountEmail") ?? undefined;

  const { detail, error } = await getStoredThread(
    user.id,
    decoded,
    accountEmail,
  );
  if (!detail) {
    return NextResponse.json(
      { error: error ?? "Thread not found" },
      { status: 404 },
    );
  }

  return NextResponse.json(detail);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ threadId: string }> },
) {
  const user = await getCurrentAuthUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { threadId } = await context.params;
  const decoded = decodeURIComponent(threadId?.trim() ?? "");
  if (!decoded) {
    return NextResponse.json({ error: "Missing thread id" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }

  const result = await patchStoredThread(user.id, decoded, parsed.data);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Update failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
