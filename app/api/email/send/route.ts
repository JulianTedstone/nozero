import "server-only";

import { NextResponse } from "next/server";
import { getCurrentAuthUser } from "@/lib/auth-server";
import { sendPlainEmail } from "@/lib/email";

export const runtime = "nodejs";

interface SendEmailBody {
  body?: string;
  cc?: string[];
  subject?: string;
  threadId?: string;
  to?: string[];
}

export async function POST(request: Request) {
  const user = await getCurrentAuthUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as SendEmailBody;
  const to = (body.to ?? [])
    .map((e) => e.trim())
    .filter((e) => e.includes("@"));
  const subject = body.subject?.trim();
  const text = body.body?.trim();

  if (to.length === 0 || !subject || !text) {
    return NextResponse.json(
      { error: "to, subject, and body are required" },
      { status: 400 }
    );
  }

  try {
    await sendPlainEmail({
      to,
      cc: body.cc,
      subject,
      body: text,
      replyTo: user.email ?? undefined,
    });
    return NextResponse.json({ ok: true, threadId: body.threadId ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Send failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
