import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/calendar";

  if (!code) {
    return NextResponse.redirect(
      new URL(`/auth/signin?error=missing_code`, url.origin),
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    const message = encodeURIComponent(error?.message ?? "exchange_failed");
    return NextResponse.redirect(
      new URL(`/auth/signin?error=${message}`, url.origin),
    );
  }

  const session = data.session;
  const user = session.user;
  const providerToken = session.provider_token ?? null;
  const providerRefreshToken = session.provider_refresh_token ?? null;
  const expiresAt = session.expires_at
    ? new Date(session.expires_at * 1000).toISOString()
    : null;

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const name =
    (typeof meta.full_name === "string" && meta.full_name) ||
    (typeof meta.name === "string" && meta.name) ||
    user.email ||
    "";
  const image =
    (typeof meta.avatar_url === "string" && meta.avatar_url) ||
    (typeof meta.picture === "string" && meta.picture) ||
    null;

  const admin = createAdminClient();
  const { error: upsertError } = await admin
    .from("profiles")
    .upsert(
      {
        id: user.id,
        email: user.email ?? null,
        name,
        image,
        provider: "google",
        access_token: providerToken,
        refresh_token: providerRefreshToken,
        expires_at: expiresAt,
      },
      { onConflict: "id" },
    );

  if (upsertError) {
    console.error("profile upsert failed", upsertError);
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
