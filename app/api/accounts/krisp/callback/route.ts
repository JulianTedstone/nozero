import { createHmac } from "crypto";
import { NextResponse } from "next/server";
import { getKrispRedirectUri, getPublicOrigin } from "@/lib/oauth-redirect";
import { saveKrispTokens } from "@/lib/krisp-tokens";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // Use the public origin, not new URL(request.url).origin — behind the host's
  // reverse proxy the latter is localhost, which would bounce the user there.
  const settingsUrl = `${getPublicOrigin(request)}/settings?section=connections`;

  if (error || !code || !state) {
    return NextResponse.redirect(
      `${settingsUrl}&krisp_error=${error ?? "missing_params"}`,
    );
  }

  let stateData: { payload: string; sig: string };
  try {
    stateData = JSON.parse(Buffer.from(state, "base64url").toString());
  } catch {
    return NextResponse.redirect(`${settingsUrl}&krisp_error=bad_state`);
  }

  const expectedSig = createHmac("sha256", process.env.NOZERO_SESSION_SECRET!)
    .update(stateData.payload)
    .digest("hex");
  if (expectedSig !== stateData.sig) {
    return NextResponse.redirect(`${settingsUrl}&krisp_error=invalid_state`);
  }

  let statePayload: { userId: string; codeVerifier: string; ts: number };
  try {
    statePayload = JSON.parse(stateData.payload);
  } catch {
    return NextResponse.redirect(`${settingsUrl}&krisp_error=bad_payload`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== statePayload.userId) {
    return NextResponse.redirect(`${settingsUrl}&krisp_error=session_mismatch`);
  }

  const clientId = process.env.KRISP_MCP_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(`${settingsUrl}&krisp_error=not_configured`);
  }

  const redirectUri = getKrispRedirectUri(request);

  const tokenUrl =
    process.env.KRISP_OAUTH_TOKEN_URL?.trim() ||
    "https://api.krisp.ai/platform/v1/oauth2/token";

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: statePayload.codeVerifier,
  });
  if (process.env.KRISP_MCP_CLIENT_SECRET) {
    body.set("client_secret", process.env.KRISP_MCP_CLIENT_SECRET);
  }

  const tokenRes = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(15000),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(
      `${settingsUrl}&krisp_error=token_exchange_failed`,
    );
  }

  const tokenData = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };

  if (!tokenData.access_token) {
    return NextResponse.redirect(`${settingsUrl}&krisp_error=no_access_token`);
  }

  await saveKrispTokens(user.id, {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token ?? null,
    tokenExpiry: tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : null,
    scope: tokenData.scope ?? null,
    updatedAt: new Date().toISOString(),
  });

  return NextResponse.redirect(`${settingsUrl}&krisp_connected=1`);
}
