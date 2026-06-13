import { NextResponse } from "next/server";
import {
  getCalendarSidebarExpanded,
  listSubscriptionViews,
} from "@/lib/calendar-subscriptions";
import { getCurrentAuthUser } from "@/lib/auth-server";

export async function GET() {
  try {
    const user = await getCurrentAuthUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [calendars, sidebarExpanded] = await Promise.all([
      listSubscriptionViews(user.id),
      getCalendarSidebarExpanded(user.id),
    ]);

    return NextResponse.json({ calendars, sidebarExpanded });
  } catch (error) {
    console.error("[calendar/subscriptions GET]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
