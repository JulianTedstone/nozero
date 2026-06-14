import { NextResponse } from "next/server";
import { saveUserPreferences } from "@/lib/auth";
import { getCurrentAuthUser } from "@/lib/auth-server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(request: Request) {
  try {
    const user = await getCurrentAuthUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as {
      displayName?: string;
      password?: string;
    };

    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const provider =
      (authData.user.app_metadata?.provider as string | undefined) ??
      authData.user.identities?.[0]?.provider ??
      "email";

    const updatePayload: {
      data?: Record<string, string>;
      password?: string;
    } = {};

    if (typeof body.displayName === "string") {
      const trimmed = body.displayName.trim();
      if (trimmed) {
        updatePayload.data = { full_name: trimmed, name: trimmed };
        await saveUserPreferences(user.id, { displayName: trimmed });
      }
    }

    if (typeof body.password === "string" && body.password.length > 0) {
      if (provider === "google") {
        return NextResponse.json(
          { error: "Password is managed by Google sign-in" },
          { status: 400 },
        );
      }
      updatePayload.password = body.password;
    }

    if (updatePayload.data || updatePayload.password) {
      const { error } = await supabase.auth.updateUser(updatePayload);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[profile PATCH]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
