import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getCalendarVisibility,
  setCalendarSidebarExpanded,
  setCalendarVisibilityMap,
} from "@/lib/calendar-subscriptions";
import { getCurrentAuthUser } from "@/lib/auth-server";

const bodySchema = z.object({
  key: z.string().min(1).optional(),
  visible: z.boolean().optional(),
  visibility: z.record(z.string(), z.boolean()).optional(),
  sidebarExpanded: z.boolean().optional(),
});

export async function PUT(request: Request) {
  try {
    const user = await getCurrentAuthUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid body" },
        { status: 400 },
      );
    }

    const { key, visible, visibility, sidebarExpanded } = parsed.data;

    if (typeof sidebarExpanded === "boolean") {
      await setCalendarSidebarExpanded(user.id, sidebarExpanded);
    }

    if (visibility) {
      const current = await getCalendarVisibility(user.id);
      await setCalendarVisibilityMap(user.id, { ...current, ...visibility });
    } else if (key && typeof visible === "boolean") {
      const current = await getCalendarVisibility(user.id);
      await setCalendarVisibilityMap(user.id, { ...current, [key]: visible });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[calendar/visibility PUT]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
