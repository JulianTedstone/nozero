import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentAuthUser } from "@/lib/auth-server";
import { postFlightdeckComment } from "@/lib/flightdeck-comments";

export const runtime = "nodejs";

const bodySchema = z.object({
  item: z.string().min(1),
  issueUrl: z.string().optional(),
  body: z.string().min(1),
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

  const result = await postFlightdeckComment({
    itemRef: parsed.data.item.trim(),
    issueUrl: parsed.data.issueUrl?.trim(),
    body: parsed.data.body.trim(),
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Comment failed" },
      { status: 422 },
    );
  }

  return NextResponse.json({ ok: true });
}
