import { createHmac } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isGoogleAccountLinkConfigured } from "@/lib/google-oauth-config";
import { getPublicOrigin } from "@/lib/oauth-redirect";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const emailHint = searchParams.get("email") ?? "";
  const accountId = searchParams.get("accountId") ?? "";
  const labelHint = searchParams.get("label") ?? "";
  const origin = getPublicOrigin(request);

  const cookieStore = await cookies();
  void cookieStore; // accessed via createClient's cookie handler
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${origin}/auth/signin`);
  }

  if (!isGoogleAccountLinkConfigured()) {
    return NextResponse.redirect(
      `${origin}/settings?section=accounts&oauth_error=google_not_configured`,
    );
  }

  const effectiveEmailHint = emailHint || user.email || "";
  // Signed state to tie the callback to the initiating user + account slot
  const payload = JSON.stringify({
    userId: user.id,
    accountId,
    email: effectiveEmailHint,
    label: labelHint,
    ts: Date.now(),
  });
  const sig = createHmac("sha256", process.env.NOZERO_SESSION_SECRET!)
    .update(payload)
    .digest("hex");
  const state = Buffer.from(JSON.stringify({ payload, sig })).toString("base64url");

  const redirectUri = `${origin}/api/auth/google/callback`;

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/gmail.readonly",
      "email",
      "profile",
    ].join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
    ...(effectiveEmailHint ? { login_hint: effectiveEmailHint } : {}),
  });

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}
