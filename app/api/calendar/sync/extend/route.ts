import { NextResponse } from "next/server";

import { getCurrentAuthUser } from "@/lib/auth-server";
import {
  extendCalendarSyncWindow,
  getCalendarSyncRangeStatus,
} from "@/lib/google-accounts-sync";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentAuthUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = await getCalendarSyncRangeStatus(user.id);
  return NextResponse.json(status);
}

/** Extend the cached sync window by one chunk into the past and/or future. */
export async function POST() {
  const user = await getCurrentAuthUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await extendCalendarSyncWindow(user.id);
    return NextResponse.json({
      status: "success",
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Extension failed",
      },
      { status: 500 },
    );
  }
}
