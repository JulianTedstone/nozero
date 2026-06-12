import { createAdminClient } from "@/lib/supabase/admin";
import { getUserRecord } from "@/lib/store";

export type GoogleTokens = {
  accessToken: string | null;
  refreshToken: string | null;
  accessTokenExpiresAt: number | null;
  refreshTokenExpiresAt: number | null;
  idToken: string | null;
  scope: string | null;
  scopes: string[];
};

/**
 * Read the Google provider tokens captured at sign-in time from nozero.profiles.
 * This covers the primary (login) account only.
 */
export async function getGoogleTokens(userId: string): Promise<GoogleTokens> {
  const user = await getUserRecord(userId);
  return {
    accessToken: user?.accessToken ?? null,
    refreshToken: user?.refreshToken ?? null,
    accessTokenExpiresAt: user?.expiresAt ?? null,
    refreshTokenExpiresAt: null,
    idToken: null,
    scope: null,
    scopes: [],
  };
}

export type ConnectedAccountToken = {
  email: string;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiry: Date | null;
  scope: string | null;
};

/**
 * Read tokens for all additional Google accounts connected via /api/auth/google/connect.
 * Stored in profiles.preferences.connectedTokens (keyed by email) to avoid PostgREST
 * schema cache issues with the calendar_tokens table.
 */
export async function getConnectedAccountTokens(
  userId: string
): Promise<ConnectedAccountToken[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("preferences")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data?.preferences) return [];

  const prefs = data.preferences as Record<string, unknown>;
  const connectedTokens = (prefs.connectedTokens ?? {}) as Record<string, Record<string, string>>;

  return Object.entries(connectedTokens).map(([email, t]) => ({
    email,
    accessToken: t.accessToken,
    refreshToken: t.refreshToken ?? null,
    tokenExpiry: t.tokenExpiry ? new Date(t.tokenExpiry) : null,
    scope: t.scope ?? null,
  }));
}

/**
 * Refresh an access token using the refresh_token grant and persist the new
 * access_token + expiry back to calendar_tokens.
 * Returns the new access token, or null if refresh fails.
 */
export async function refreshConnectedAccountToken(
  userId: string,
  email: string,
  refreshToken: string
): Promise<string | null> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    console.error("[google-tokens] refresh failed for", email, await res.text());
    return null;
  }

  const data = await res.json();
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("preferences")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.preferences) {
    const prefs = profile.preferences as Record<string, unknown>;
    const tokens = (prefs.connectedTokens ?? {}) as Record<string, Record<string, string>>;
    if (tokens[email]) {
      tokens[email].accessToken = data.access_token;
      tokens[email].tokenExpiry = new Date(Date.now() + data.expires_in * 1000).toISOString();
      tokens[email].updatedAt = new Date().toISOString();
      await admin.from("profiles").update({ preferences: { ...prefs, connectedTokens: tokens } }).eq("id", userId);
    }
  }

  return data.access_token as string;
}

/**
 * Get a valid access token for an additional connected account, refreshing if needed.
 */
export async function getValidAccessToken(
  userId: string,
  token: ConnectedAccountToken
): Promise<string | null> {
  const isExpired = token.tokenExpiry
    ? token.tokenExpiry.getTime() - Date.now() < 60_000
    : false;

  if (!isExpired) return token.accessToken;
  if (!token.refreshToken) return null;

  return refreshConnectedAccountToken(userId, token.email, token.refreshToken);
}
