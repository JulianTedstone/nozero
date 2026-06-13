import "server-only";

import { NextResponse } from "next/server";
import { getCurrentAuthUser } from "@/lib/auth-server";
import { syncSomaThreads } from "@/lib/email-store";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Pull latest threads from Soma into Supabase (manual or background sync). */
export async function POST() {
  const user = await getCurrentAuthUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await syncSomaThreads(user.id, 60);
    return NextResponse.json({
      status: "success",
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Email sync failed",
      },
      { status: 500 },
    );
  }
}
