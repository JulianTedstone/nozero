import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentAuthUser } from "@/lib/auth-server";
import { towerConfigured, towerSetItemFields } from "@/lib/tower-mcp-client";

export const runtime = "nodejs";

const bodySchema = z.object({
  item: z.string().min(1),
  fields: z.record(z.string(), z.string()).refine(
    (fields) => Object.keys(fields).length > 0,
    "At least one field required",
  ),
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
          "Field updates require NOZERO_TOWER_API_KEY (Tower actor credential).",
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

  const result = await towerSetItemFields({
    item: parsed.data.item.trim(),
    fields: parsed.data.fields,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Update failed" },
      { status: 422 },
    );
  }

  return NextResponse.json({ ok: true });
}
