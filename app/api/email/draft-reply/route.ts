import "server-only";

import { NextResponse } from "next/server";
import { getCurrentAuthUser } from "@/lib/auth-server";
import { draftReplyForThread } from "@/lib/email-enrichment";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  const user = await getCurrentAuthUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    subject?: string;
    persona?: string;
    messages?: Array<{ from: string; body: string; isMine?: boolean }>;
  };

  const draft = await draftReplyForThread({
    subject: body.subject?.trim() || "(No subject)",
    persona: body.persona,
    threadMessages: body.messages ?? [],
  });

  if (!draft) {
    return NextResponse.json(
      { error: "Could not generate a draft reply" },
      { status: 503 },
    );
  }

  return NextResponse.json({ draft });
}
