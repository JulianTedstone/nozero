import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentAuthUser } from "@/lib/auth-server";
import { towerEnsureStream } from "@/lib/tower-mcp-client";

export const runtime = "nodejs";

const bodySchema = z.object({
  name: z.string().min(1),
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

  const ensured = await towerEnsureStream({ name: parsed.data.name.trim() });
  if (!ensured.ok && !ensured.stream) {
    return NextResponse.json(
      { error: ensured.error ?? "Could not create stream" },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    stream: ensured.stream ?? parsed.data.name.trim(),
  });
}
