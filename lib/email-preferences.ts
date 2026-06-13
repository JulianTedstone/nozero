import { getUserPreferences, getUserRecord } from "@/lib/store";
import {
  patchUserPreferences,
  readUserPreferences,
} from "@/lib/user-preferences";

export type EmailAccountView = {
  id: string;
  email: string;
  label: string;
  color: string;
  connected: boolean;
  visible: boolean;
  isPrimary: boolean;
};

export async function getEmailAccountVisibility(
  userId: string,
): Promise<Record<string, boolean>> {
  const prefs = await getUserPreferences(userId);
  const raw = prefs.emailAccountVisibility;
  if (!raw || typeof raw !== "object") return {};
  return raw as Record<string, boolean>;
}

export async function setEmailAccountVisibility(
  userId: string,
  email: string,
  visible: boolean,
) {
  const prefs = await readUserPreferences(userId);
  const emailAccountVisibility = {
    ...((prefs.emailAccountVisibility as Record<string, boolean>) ?? {}),
    [email.toLowerCase()]: visible,
  };
  await patchUserPreferences(userId, { emailAccountVisibility });
}

export async function setEmailAccountVisibilityMap(
  userId: string,
  map: Record<string, boolean>,
) {
  await patchUserPreferences(userId, { emailAccountVisibility: map });
}

export async function getEmailAccountsExpanded(userId: string): Promise<boolean> {
  const prefs = await getUserPreferences(userId);
  return prefs.emailAccountsExpanded !== false;
}

export async function setEmailAccountsExpanded(
  userId: string,
  expanded: boolean,
) {
  await patchUserPreferences(userId, { emailAccountsExpanded: expanded });
}

const ACCOUNT_COLORS = [
  "#4285F4",
  "#34A853",
  "#FBBC04",
  "#EA4335",
  "#9C27B0",
  "#00ACC1",
];

function colorForIndex(index: number): string {
  return ACCOUNT_COLORS[index % ACCOUNT_COLORS.length] ?? "#4285F4";
}

export async function listEmailAccountViews(
  userId: string,
): Promise<EmailAccountView[]> {
  const { getConnectedAccounts } = await import("@/lib/connected-accounts");
  const user = await getUserRecord(userId);
  const visibility = await getEmailAccountVisibility(userId);
  const views: EmailAccountView[] = [];
  let colorIndex = 0;

  if (user?.email) {
    views.push({
      id: "primary",
      email: user.email,
      label: "Primary",
      color: colorForIndex(colorIndex++),
      connected: user.provider === "google",
      visible: visibility[user.email.toLowerCase()] !== false,
      isPrimary: true,
    });
  }

  const connected = await getConnectedAccounts(userId);
  for (const account of connected) {
    if (account.type !== "google" && account.type !== "imap") continue;
    if (!account.connected) continue;
    views.push({
      id: account.id,
      email: account.email,
      label: account.label || account.email,
      color: account.color || colorForIndex(colorIndex++),
      connected: true,
      visible: visibility[account.email.toLowerCase()] !== false,
      isPrimary: false,
    });
  }

  return views;
}

export function enabledAccountEmails(accounts: EmailAccountView[]): string[] {
  return accounts
    .filter((a) => a.visible && a.connected)
    .map((a) => a.email.toLowerCase());
}

export function inferAccountEmail(
  participants: string[],
  userEmails: string[],
): string {
  const set = new Set(userEmails.map((e) => e.toLowerCase()));
  for (const p of participants) {
    const lower = p.toLowerCase();
    if (set.has(lower)) return lower;
  }
  return userEmails[0] ?? "unknown";
}
