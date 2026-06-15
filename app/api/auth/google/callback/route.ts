import { createHmac } from "crypto";
import { NextResponse } from "next/server";
import {
  getConnectedAccounts,
  upsertConnectedAccountMeta,
} from "@/lib/connected-accounts";
import { isGoogleSignInUser } from "@/lib/auth-provider";
import { isGoogleAccountLinkConfigured } from "@/lib/google-oauth-config";
import { getPublicOrigin } from "@/lib/oauth-redirect";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const origin = getPublicOrigin(request);
  const settingsUrl = `${origin}/settings?section=accounts`;

  if (!isGoogleAccountLinkConfigured()) {
    return NextResponse.redirect(
      `${settingsUrl}&oauth_error=google_not_configured`,
    );
  }

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

  let statePayload: {
    userId: string;
    accountId: string;
    email: string;
    label?: string;
    ts: number;
  };
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

  const tokenData = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
    id_token: string;
  };

  const grantedScope = tokenData.scope ?? "";
  const hasGmailScope = grantedScope.includes("gmail.readonly");

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
  const tokenEntry = {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token ?? null,
    tokenExpiry: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
    scope: tokenData.scope ?? null,
    updatedAt: new Date().toISOString(),
  };
  connectedTokens[email] = tokenEntry;

  const isPrimaryEmail =
    email.toLowerCase() === (user.email ?? "").toLowerCase();
  const googleLogin = await isGoogleSignInUser(user.id);

  const { error: saveErr } = await admin
    .from("profiles")
    .update({
      preferences: { ...prefs, connectedTokens },
      ...(isPrimaryEmail && googleLogin
        ? {
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token ?? null,
            expires_at: new Date(
              Date.now() + tokenData.expires_in * 1000,
            ).toISOString(),
            provider: "google",
          }
        : {}),
    })
    .eq("id", user.id);

  if (saveErr) {
    console.error("[google/callback] token save failed:", saveErr);
    return NextResponse.redirect(`${settingsUrl}&oauth_error=db_write_failed`);
  }

  const existingAccounts = await getConnectedAccounts(user.id).then((list) =>
    list.filter((a) => a.id !== "primary-google"),
  );
  const accountId = statePayload.accountId;
  const existingMeta = existingAccounts.find((a) => a.id === accountId);
  const byEmail = existingAccounts.find(
    (a) => a.email.toLowerCase() === email.toLowerCase(),
  );

  const resolvedAccountId =
    existingMeta?.id ??
    byEmail?.id ??
    (accountId !== "new" ? accountId : `acct-${Date.now()}`);

  const labelHint = statePayload.label?.trim();
  await upsertConnectedAccountMeta(user.id, {
    id: resolvedAccountId,
    email,
    type: "google",
    label:
      existingMeta?.label ??
      byEmail?.label ??
      (labelHint || "Google Calendar & Gmail"),
    connected: true,
    color: existingMeta?.color ?? byEmail?.color ?? "#4285F4",
  });

  const {
    getSubscriptionsByAccount,
    setSubscriptionsForAccount,
    defaultGoogleSubscriptions,
  } = await import("@/lib/calendar-subscriptions");
  const { getGoogleCalendars } = await import("@/lib/google-calendar");

  const subsByAccount = await getSubscriptionsByAccount(user.id);
  if (!subsByAccount[resolvedAccountId]?.length) {
    try {
      const calendars = await getGoogleCalendars(
        user.id,
        tokenData.access_token,
        tokenData.refresh_token ?? null,
        new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
      );
      await setSubscriptionsForAccount(
        user.id,
        resolvedAccountId,
        defaultGoogleSubscriptions(calendars),
      );
    } catch (subError) {
      console.error("[google/callback] default subscriptions failed:", subError);
    }
  }

  const gmailParam = hasGmailScope ? "" : "&gmail_warning=1";
  const successUrl = `${settingsUrl}&connected=${encodeURIComponent(resolvedAccountId)}&email=${encodeURIComponent(email)}&sync=1${gmailParam}`;
  return NextResponse.redirect(successUrl);
}
