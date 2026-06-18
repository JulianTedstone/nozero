import { NextResponse } from "next/server";
import { getCurrentAuthUser } from "@/lib/auth-server";
import { clearKrispTokens } from "@/lib/krisp-tokens";

export async function POST() {
  const user = await getCurrentAuthUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await clearKrispTokens(user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Disconnect failed" },
      { status: 500 },
    );
  }
}
