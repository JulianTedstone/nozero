import { NextResponse } from "next/server";

import { suggestContacts } from "@/lib/contact-suggestions";
import { getCurrentAuthUser } from "@/lib/auth-server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getCurrentAuthUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) {
    return NextResponse.json({ suggestions: [] });
  }

  try {
    const suggestions = await suggestContacts(user.id, query);
    return NextResponse.json({ suggestions });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Lookup failed",
        suggestions: [],
      },
      { status: 500 },
    );
  }
}
