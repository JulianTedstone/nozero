import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentAuthUser } from "@/lib/auth-server";
import { getLocalContacts, saveLocalContact } from "@/lib/local-contacts";

export const runtime = "nodejs";

const bodySchema = z.object({
  email: z.string().email(),
  name: z.string().optional().nullable(),
  name2: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  company: z.string().optional().nullable(),
});

export async function GET() {
  const user = await getCurrentAuthUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const contacts = await getLocalContacts(user.id);
  return NextResponse.json({ contacts: Object.values(contacts) });
}

export async function POST(request: Request) {
  const user = await getCurrentAuthUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid contact" },
      { status: 400 },
    );
  }

  try {
    const contact = await saveLocalContact(user.id, parsed.data);
    return NextResponse.json({ ok: true, contact });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save contact" },
      { status: 422 },
    );
  }
}
