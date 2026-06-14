import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentAuthUser } from "@/lib/auth-server";
import { defaultApprovalForStream } from "@/lib/flightdeck-defaults";
import { towerCapture, towerConfigured } from "@/lib/tower-mcp-client";

export const runtime = "nodejs";

const bodySchema = z.object({
  title: z.string().min(1),
  body: z.string().optional(),
  stream: z.string().min(1),
  owner: z.string().optional(),
});

export async function POST(request: Request) {
  const user = await getCurrentAuthUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!towerConfigured()) {
    return NextResponse.json(
      {
        error:
          "Capturing tasks requires NOZERO_TOWER_API_KEY (Tower actor credential).",
      },
      { status: 503 },
    );
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }

  const stream = parsed.data.stream.trim();
  const { approval, approver } = defaultApprovalForStream(stream);
  const owner = parsed.data.owner?.trim() || "Ted";

  const result = await towerCapture({
    title: parsed.data.title.trim(),
    body: parsed.data.body?.trim(),
    fields: {
      Stream: stream,
      Owner: owner,
      Approval: approval,
      Approver: approver,
    },
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Capture failed" },
      { status: 422 },
    );
  }

  return NextResponse.json({ ok: true, ref: result.ref });
}
