import { createHmac } from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const settingsUrl = `${origin}/settings?section=accounts`;

  if (error || !code || !state) {
    return NextResponse.redirect(`${settingsUrl}&oauth_error=${error ?? "missing_params"}`);
  }

  // Verify signed state
  let stateData: { payload: string; sig: string };
  try {
    stateData = JSON.parse(Buffer.from(state, "base64url").toString());
  } catch {
    return NextResponse.redirect(`${settingsUrl}&oauth_error=bad_state`);
  }

  const expectedSig = createHmac("sha256", process.env.NOZERO_SESSION_SECRET!)
    .update(stateData.payload)
    .digest("hex");
  if (expectedSig !== stateData.sig) {
    return NextResponse.redirect(`${settingsUrl}&oauth_error=invalid_state`);
  }

  let statePayload: { userId: string; accountId: string; email: string; ts: number };
  try {
    statePayload = JSON.parse(stateData.payload);
  } catch {
    return NextResponse.redirect(`${settingsUrl}&oauth_error=bad_payload`);
  }

  // Verify the current session belongs to the user who initiated the flow
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== statePayload.userId) {
    return NextResponse.redirect(`${settingsUrl}&oauth_error=session_mismatch`);
  }

  // Exchange code for tokens
  const redirectUri = `${origin}/api/auth/google/callback`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(`${settingsUrl}&oauth_error=token_exchange_failed`);
  }

  const tokenData = await tokenRes.json();

  // Extract email from id_token
  let email = statePayload.email;
  try {
    const idPayload = JSON.parse(
      Buffer.from(tokenData.id_token.split(".")[1], "base64").toString()
    );
    email = idPayload.email ?? email;
  } catch {
    // fall back to email hint from state
  }

  // Store tokens in profiles.preferences under "connectedTokens" — avoids PostgREST
  // schema cache issues with the new calendar_tokens table.
  const admin = createAdminClient();
  const { data: profile, error: fetchErr } = await admin
    .from("profiles")
    .select("preferences")
    .eq("id", user.id)
    .maybeSingle();

  if (fetchErr) {
    console.error("[google/callback] profile fetch failed:", fetchErr);
    return NextResponse.redirect(`${settingsUrl}&oauth_error=db_write_failed`);
  }

  const prefs = (profile?.preferences ?? {}) as Record<string, unknown>;
  const connectedTokens = (prefs.connectedTokens ?? {}) as Record<string, unknown>;
  connectedTokens[email] = {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token ?? null,
    tokenExpiry: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
    scope: tokenData.scope ?? null,
    updatedAt: new Date().toISOString(),
  };

  const { error: saveErr } = await admin
    .from("profiles")
    .update({ preferences: { ...prefs, connectedTokens } })
    .eq("id", user.id);

  if (saveErr) {
    console.error("[google/callback] token save failed:", saveErr);
    return NextResponse.redirect(`${settingsUrl}&oauth_error=db_write_failed`);
  }

  const successUrl = `${settingsUrl}&connected=${encodeURIComponent(statePayload.accountId)}&email=${encodeURIComponent(email)}`;
  return NextResponse.redirect(successUrl);
}
