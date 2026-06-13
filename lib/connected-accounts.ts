import { createAdminClient } from "@/lib/supabase/admin";
import { getUserPreferences, getUserRecord } from "@/lib/store";

export type ConnectedAccountMeta = {
  id: string;
  email: string;
  type: "google" | "caldav" | "imap";
  label: string;
  connected: boolean;
  color: string;
  serverUrl?: string;
  username?: string;
};

type ConnectedTokenRecord = {
  accessToken: string;
  refreshToken?: string | null;
  tokenExpiry?: string | null;
  scope?: string | null;
  updatedAt?: string | null;
  googleSyncToken?: string | null;
};

async function readPreferences(userId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("preferences")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data?.preferences ?? {}) as Record<string, unknown>;
}

async function writePreferences(
  userId: string,
  prefs: Record<string, unknown>,
) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ preferences: prefs })
    .eq("id", userId);
  if (error) throw error;
}

export async function getConnectedAccounts(
  userId: string,
): Promise<ConnectedAccountMeta[]> {
  const prefs = await readPreferences(userId);
  const raw = prefs.connectedAccounts;
  if (!Array.isArray(raw)) return [];
  return raw as ConnectedAccountMeta[];
}

export async function saveConnectedAccounts(
  userId: string,
  accounts: ConnectedAccountMeta[],
) {
  const prefs = await readPreferences(userId);
  await writePreferences(userId, { ...prefs, connectedAccounts: accounts });
}

export async function upsertConnectedAccountMeta(
  userId: string,
  account: ConnectedAccountMeta,
) {
  const existing = await getConnectedAccounts(userId);
  const idx = existing.findIndex((a) => a.id === account.id);
  const next =
    idx >= 0
      ? existing.map((a) => (a.id === account.id ? { ...a, ...account } : a))
      : [...existing, account];
  await saveConnectedAccounts(userId, next);
}

export async function removeConnectedAccountMeta(
  userId: string,
  accountId: string,
) {
  const existing = await getConnectedAccounts(userId);
  await saveConnectedAccounts(
    userId,
    existing.filter((a) => a.id !== accountId),
  );
}

export async function getConnectedTokenRecord(
  userId: string,
  email: string,
): Promise<ConnectedTokenRecord | null> {
  const prefs = await readPreferences(userId);
  const connectedTokens = (prefs.connectedTokens ?? {}) as Record<
    string,
    ConnectedTokenRecord
  >;
  return connectedTokens[email] ?? null;
}

export async function setConnectedAccountSyncToken(
  userId: string,
  email: string,
  googleSyncToken: string,
) {
  const prefs = await readPreferences(userId);
  const connectedTokens = (prefs.connectedTokens ?? {}) as Record<
    string,
    ConnectedTokenRecord
  >;
  if (!connectedTokens[email]) return;
  connectedTokens[email] = {
    ...connectedTokens[email],
    googleSyncToken,
    updatedAt: new Date().toISOString(),
  };
  await writePreferences(userId, { ...prefs, connectedTokens });
}

export async function removeConnectedToken(userId: string, email: string) {
  const prefs = await readPreferences(userId);
  const connectedTokens = { ...(prefs.connectedTokens as Record<string, unknown> | undefined) };
  delete connectedTokens[email];
  await writePreferences(userId, { ...prefs, connectedTokens });
}

/** All Google accounts with valid OAuth tokens (primary login + connected). */
export async function listGoogleAccountsForSync(userId: string): Promise<
  Array<{
    email: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    isPrimary: boolean;
    googleSyncToken?: string;
  }>
> {
  const user = await getUserRecord(userId);
  const prefs = await getUserPreferences(userId);
  const connectedTokens = (prefs.connectedTokens ?? {}) as Record<
    string,
    ConnectedTokenRecord
  >;

  const accounts: Array<{
    email: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    isPrimary: boolean;
    googleSyncToken?: string;
  }> = [];

  const primaryEmail = user?.email?.toLowerCase();
  if (
    user?.accessToken &&
    user.refreshToken &&
    user.email &&
    user.provider === "google"
  ) {
    accounts.push({
      email: user.email,
      accessToken: user.accessToken,
      refreshToken: user.refreshToken,
      expiresAt: user.expiresAt ? Math.floor(user.expiresAt / 1000) : 0,
      isPrimary: true,
      googleSyncToken: user.googleSyncToken,
    });
  }

  for (const [email, token] of Object.entries(connectedTokens)) {
    if (!token.accessToken) continue;
    if (primaryEmail && email.toLowerCase() === primaryEmail) continue;
    if (!token.refreshToken) continue;
    accounts.push({
      email,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresAt: token.tokenExpiry
        ? Math.floor(new Date(token.tokenExpiry).getTime() / 1000)
        : 0,
      isPrimary: false,
      googleSyncToken: token.googleSyncToken ?? undefined,
    });
  }

  return accounts;
}
