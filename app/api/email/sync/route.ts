import "server-only";

import { NextResponse } from "next/server";
import { getCurrentAuthUser } from "@/lib/auth-server";
import { syncMailThreads } from "@/lib/email-store";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Pull latest threads from Gmail/IMAP into Supabase (manual or background sync). */
export async function POST() {
  const user = await getCurrentAuthUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { synced, errors } = await syncMailThreads(user.id, 60);
    const hasErrors = errors.length > 0;
    return NextResponse.json({
      status: hasErrors && synced === 0 ? "error" : "success",
      synced,
      errors: hasErrors ? errors : undefined,
      syncedAt: new Date().toISOString(),
      message:
        hasErrors && synced === 0
          ? errors.join("; ")
          : hasErrors
            ? `Synced ${synced} threads with warnings`
            : `Synced ${synced} threads`,
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
