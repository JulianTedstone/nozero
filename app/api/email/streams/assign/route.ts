import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentAuthUser } from "@/lib/auth-server";
import { patchStoredThread } from "@/lib/email-store";
import { towerEnsureStream } from "@/lib/tower-mcp-client";

export const runtime = "nodejs";

const bodySchema = z.object({
  threadId: z.string().min(1),
  accountEmail: z.string().email().optional(),
  stream: z.string().min(1),
  createIfMissing: z.boolean().optional(),
});

export async function POST(request: Request) {
  const user = await getCurrentAuthUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }

  const { threadId, accountEmail, stream, createIfMissing } = parsed.data;
  let resolvedStream = stream.trim();

  if (createIfMissing) {
    const ensured = await towerEnsureStream({ name: resolvedStream });
    if (!ensured.ok && !ensured.stream) {
      return NextResponse.json(
        { error: ensured.error ?? "Could not create stream" },
        { status: 502 },
      );
    }
    if (ensured.stream) {
      resolvedStream = ensured.stream;
    }
  }

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();
  let query = admin
    .schema("nozero")
    .from("email_threads")
    .select("streams")
    .eq("user_id", user.id)
    .eq("external_id", threadId);

  if (accountEmail) {
    query = query.eq("account_email", accountEmail.toLowerCase());
  }

  const { data: row } = await query.maybeSingle();
  const existing = Array.isArray(row?.streams)
    ? (row.streams as string[])
    : [];
  const streams = [...new Set([...existing, resolvedStream])];

  const result = await patchStoredThread(user.id, threadId, {
    accountEmail,
    streams,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Assign failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, stream: resolvedStream, streams });
}
