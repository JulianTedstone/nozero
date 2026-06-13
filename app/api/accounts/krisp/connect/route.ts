import { createHash, createHmac, randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { getKrispRedirectUri, getPublicOrigin } from "@/lib/oauth-redirect";
import { createClient } from "@/lib/supabase/server";

function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export async function GET(request: Request) {
  const origin = getPublicOrigin(request);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${origin}/auth/signin`);
  }

  const clientId = process.env.KRISP_MCP_CLIENT_ID;
  if (!clientId) {
    return new NextResponse("KRISP_MCP_CLIENT_ID not configured", {
      status: 500,
    });
  }

  const redirectUri = getKrispRedirectUri(request);

  const authorizeUrl =
    process.env.KRISP_OAUTH_AUTHORIZE_URL?.trim() ||
    "https://api.krisp.ai/platform/v1/oauth2/authorize";

  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = pkceChallenge(codeVerifier);

  const payload = JSON.stringify({
    userId: user.id,
    codeVerifier,
    ts: Date.now(),
  });
  const sig = createHmac("sha256", process.env.NOZERO_SESSION_SECRET!)
    .update(payload)
    .digest("hex");
  const state = Buffer.from(JSON.stringify({ payload, sig })).toString(
    "base64url",
  );

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    scope:
      "user::meetings::read user::meetings:transcripts::read user::meetings:metadata::read user::meetings::list user::activities::list",
  });

  return NextResponse.redirect(`${authorizeUrl}?${params}`);
}
