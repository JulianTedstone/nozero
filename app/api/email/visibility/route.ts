import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentAuthUser } from "@/lib/auth-server";
import {
  getEmailAccountVisibility,
  setEmailAccountVisibilityMap,
  setEmailAccountsExpanded,
} from "@/lib/email-preferences";

const bodySchema = z.object({
  email: z.string().email().optional(),
  visible: z.boolean().optional(),
  visibility: z.record(z.string(), z.boolean()).optional(),
  accountsExpanded: z.boolean().optional(),
});

export const runtime = "nodejs";

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

    const { email, visible, visibility, accountsExpanded } = parsed.data;

    if (typeof accountsExpanded === "boolean") {
      await setEmailAccountsExpanded(user.id, accountsExpanded);
    }

    if (visibility) {
      const current = await getEmailAccountVisibility(user.id);
      await setEmailAccountVisibilityMap(user.id, { ...current, ...visibility });
    } else if (email && typeof visible === "boolean") {
      const current = await getEmailAccountVisibility(user.id);
      await setEmailAccountVisibilityMap(user.id, {
        ...current,
        [email.toLowerCase()]: visible,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[email/visibility PUT]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
