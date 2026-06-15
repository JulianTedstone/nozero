import "server-only";

import type { CalendarSubscription } from "@/lib/calendar-subscriptions";
import {
  getConnectedAccounts,
  saveConnectedAccounts,
  type ConnectedAccountMeta,
} from "@/lib/connected-accounts";
import { isGoogleSignInUser } from "@/lib/auth-provider";
import { createAdminClient } from "@/lib/supabase/admin";
import { readUserPreferences } from "@/lib/user-preferences";

const ACCOUNT_COLORS = [
  "#4285F4",
  "#34A853",
  "#8B5CF6",
  "#F59E0B",
  "#EF4444",
  "#EC4899",
];

function inferEmailFromCalDavCalendarId(calendarId: string): string | null {
  const match = calendarId.match(/\/([a-zA-Z0-9%._+-]+@[a-zA-Z0-9.-]+)/);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]).toLowerCase();
  } catch {
    return match[1].toLowerCase();
  }
}

function colorForIndex(index: number): string {
  return ACCOUNT_COLORS[index % ACCOUNT_COLORS.length] ?? "#4285F4";
}

/**
 * Rebuild preferences.connectedAccounts from orphaned tokens, CalDAV creds,
 * and calendar subscription keys when the registry was wiped but credentials remain.
 */
export async function repairConnectedAccountsIfEmpty(
  userId: string,
): Promise<{ repaired: boolean; accounts: ConnectedAccountMeta[] }> {
  const existing = await getConnectedAccounts(userId);
  const prefs = await readUserPreferences(userId);
  const subscriptionIds = Object.keys(prefs.calendarSubscriptions ?? {}).filter(
    (id) => id !== "primary-google",
  );
  const existingIds = new Set(existing.map((a) => a.id));
  const idsAligned =
    subscriptionIds.length === 0 ||
    subscriptionIds.every((id) => existingIds.has(id));

  if (existing.length > 0 && idsAligned) {
    return { repaired: false, accounts: existing };
  }

  const byId = new Map<string, ConnectedAccountMeta>();
  const byEmail = new Map<string, ConnectedAccountMeta>();
  let colorIndex = 0;

  const addAccount = (account: ConnectedAccountMeta) => {
    const emailKey = account.email.toLowerCase();
    const prev = byEmail.get(emailKey);
    if (prev) {
      byId.set(prev.id, { ...prev, ...account, id: prev.id });
      byEmail.set(emailKey, byId.get(prev.id)!);
      return;
    }
    byId.set(account.id, account);
    byEmail.set(emailKey, account);
  };

  const calendarSubscriptions = (prefs.calendarSubscriptions ?? {}) as Record<
    string,
    CalendarSubscription[]
  >;

  for (const [accountId, subs] of Object.entries(calendarSubscriptions)) {
    if (accountId === "primary-google" || !subs?.length) continue;

    const sub = subs[0]!;
    let email: string | null = null;
    let type: "google" | "caldav" = "google";

    if (sub.calendarId.includes("@") && !sub.calendarId.startsWith("http")) {
      email = sub.calendarId.toLowerCase();
    } else if (sub.calendarId.startsWith("http")) {
      type = "caldav";
      email = inferEmailFromCalDavCalendarId(sub.calendarId);
    }

    if (!email) continue;

    addAccount({
      id: accountId,
      email,
      type,
      label: sub.name?.trim() || email,
      connected: true,
      color: sub.color || colorForIndex(colorIndex++),
    });
  }

  const connectedTokens = (prefs.connectedTokens ?? {}) as Record<
    string,
    unknown
  >;
  for (const email of Object.keys(connectedTokens)) {
    if (byEmail.has(email.toLowerCase())) {
      const account = byEmail.get(email.toLowerCase())!;
      if (account.type !== "google") {
        addAccount({ ...account, type: "google", connected: true });
      }
      continue;
    }
    addAccount({
      id: `acct-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      email,
      type: "google",
      label: "Google Calendar & Gmail",
      connected: true,
      color: colorForIndex(colorIndex++),
    });
  }

  const connectedCalDav = (prefs.connectedCalDav ?? {}) as Record<
    string,
    { serverUrl: string; username: string }
  >;
  for (const [email, creds] of Object.entries(connectedCalDav)) {
    const key = email.toLowerCase();
    if (byEmail.has(key)) {
      const account = byEmail.get(key)!;
      addAccount({
        ...account,
        type: "caldav",
        connected: true,
        serverUrl: creds.serverUrl,
        username: creds.username,
        hasStoredCredentials: true,
      });
      continue;
    }
    addAccount({
      id: `acct-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      email,
      type: "caldav",
      label: email.split("@")[0] ?? email,
      connected: true,
      color: colorForIndex(colorIndex++),
      serverUrl: creds.serverUrl,
      username: creds.username,
      hasStoredCredentials: true,
    });
  }

  const connectedImap = (prefs.connectedImap ?? {}) as Record<
    string,
    { serverUrl: string; username: string }
  >;
  for (const [email, creds] of Object.entries(connectedImap)) {
    const key = email.toLowerCase();
    if (byEmail.has(key)) continue;
    addAccount({
      id: `acct-${Date.now()}-mail-${Math.random().toString(36).slice(2, 8)}`,
      email,
      type: "imap",
      label: email.split("@")[0] ?? email,
      connected: true,
      color: colorForIndex(colorIndex++),
      serverUrl: creds.serverUrl,
      username: creds.username,
      hasStoredCredentials: true,
    });
  }

  const accounts = [...byId.values()];
  if (accounts.length === 0) {
    return { repaired: false, accounts: existing };
  }

  const unchanged =
    existing.length === accounts.length &&
    accounts.every((account) => {
      const prev = existing.find(
        (item) =>
          item.id === account.id ||
          item.email.toLowerCase() === account.email.toLowerCase(),
      );
      return (
        prev &&
        prev.id === account.id &&
        prev.type === account.type &&
        prev.email.toLowerCase() === account.email.toLowerCase()
      );
    });

  if (unchanged) {
    return { repaired: false, accounts: existing };
  }

  await saveConnectedAccounts(userId, accounts);
  return { repaired: true, accounts };
}

/** Align profiles.provider with Auth and drop orphan primary OAuth for email login. */
export async function repairProfileAuthProvider(userId: string): Promise<void> {
  const authProvider = await getAuthProviderForUser(userId);
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("provider, access_token, refresh_token")
    .eq("id", userId)
    .maybeSingle();

  if (!profile) return;

  const patch: Record<string, unknown> = {};

  if (profile.provider !== authProvider) {
    patch.provider = authProvider;
  }

  if (authProvider !== "google" && (profile.access_token || profile.refresh_token)) {
    patch.access_token = null;
    patch.refresh_token = null;
    patch.expires_at = null;
    patch.google_sync_token = null;
  }

  if (Object.keys(patch).length === 0) return;

  await admin.from("profiles").update(patch).eq("id", userId);
}

export async function repairUserAccounts(userId: string) {
  await repairProfileAuthProvider(userId);
  return repairConnectedAccountsIfEmpty(userId);
}
