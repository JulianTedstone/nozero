import "server-only";

import { listGoogleAccountsForSync } from "@/lib/connected-accounts";
import { refreshConnectedAccountToken } from "@/lib/google-tokens";
import { createAdminClient } from "@/lib/supabase/admin";

export type GoogleMailAuth = {
  email: string;
  accessToken: string;
  isPrimary: boolean;
};

async function refreshPrimaryGoogleToken(
  userId: string,
  refreshToken: string,
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
    console.error("[google-mail-auth] primary refresh failed", await res.text());
    return null;
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  const admin = createAdminClient();
  await admin
    .from("profiles")
    .update({
      access_token: data.access_token,
      expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    })
    .eq("id", userId);

  return data.access_token;
}

async function validAccessTokenForAccount(
  userId: string,
  account: {
    email: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    isPrimary: boolean;
  },
): Promise<string | null> {
  const expiresMs = account.expiresAt > 0 ? account.expiresAt * 1000 : 0;
  const stillValid = expiresMs > Date.now() + 60_000;

  if (stillValid && account.accessToken) {
    return account.accessToken;
  }

  if (!account.refreshToken) {
    return null;
  }

  if (account.isPrimary) {
    return refreshPrimaryGoogleToken(userId, account.refreshToken);
  }

  return refreshConnectedAccountToken(
    userId,
    account.email,
    account.refreshToken,
  );
}

export async function getGoogleMailAuthForEmail(
  userId: string,
  email: string,
): Promise<GoogleMailAuth | null> {
  const target = email.toLowerCase();
  const accounts = await listGoogleAccountsForSync(userId);

  for (const account of accounts) {
    if (account.email.toLowerCase() !== target) continue;
    const accessToken = await validAccessTokenForAccount(userId, account);
    if (!accessToken) return null;
    return {
      email: account.email,
      accessToken,
      isPrimary: account.isPrimary,
    };
  }

  return null;
}

export async function listGoogleMailAuths(
  userId: string,
  emails: string[],
): Promise<GoogleMailAuth[]> {
  const allowed = new Set(emails.map((e) => e.toLowerCase()));
  const accounts = await listGoogleAccountsForSync(userId);
  const auths: GoogleMailAuth[] = [];

  for (const account of accounts) {
    if (!allowed.has(account.email.toLowerCase())) continue;
    const accessToken = await validAccessTokenForAccount(userId, account);
    if (!accessToken) continue;
    auths.push({
      email: account.email,
      accessToken,
      isPrimary: account.isPrimary,
    });
  }

  return auths;
}
