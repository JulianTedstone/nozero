import { getUserPreferences, getUserRecord } from "@/lib/store";
import {
  patchUserPreferences,
  readUserPreferences,
} from "@/lib/user-preferences";

export type CalendarSubscription = {
  calendarId: string;
  name: string;
  color: string;
  primary?: boolean;
};

export type CalendarSubscriptionView = CalendarSubscription & {
  accountId: string;
  accountEmail: string;
  sourceType: "google" | "caldav";
  key: string;
  visible: boolean;
};

export function calendarSubscriptionKey(
  accountId: string,
  calendarId: string,
): string {
  return `${accountId}::${calendarId}`;
}

export function defaultGoogleSubscriptions(
  calendars: Array<{ id: string; summary: string; primary: boolean; backgroundColor: string; accessRole?: string }>,
): CalendarSubscription[] {
  const primary = calendars.filter((c) => c.primary);
  if (primary.length > 0) {
    return primary.map((c) => ({
      calendarId: c.id,
      name: c.summary,
      color: c.backgroundColor,
      primary: true,
    }));
  }
  const owned = calendars.filter((c) => c.accessRole === "owner");
  const pick = owned.length > 0 ? owned.slice(0, 1) : calendars.slice(0, 1);
  return pick.map((c) => ({
    calendarId: c.id,
    name: c.summary,
    color: c.backgroundColor,
    primary: c.primary,
  }));
}

export async function getSubscriptionsByAccount(
  userId: string,
): Promise<Record<string, CalendarSubscription[]>> {
  const prefs = await getUserPreferences(userId);
  const raw = prefs.calendarSubscriptions;
  if (!raw || typeof raw !== "object") return {};
  return raw as Record<string, CalendarSubscription[]>;
}

export async function setSubscriptionsForAccount(
  userId: string,
  accountId: string,
  subscriptions: CalendarSubscription[],
) {
  const prefs = await readUserPreferences(userId);
  const calendarSubscriptions = {
    ...((prefs.calendarSubscriptions as Record<string, CalendarSubscription[]>) ??
      {}),
    [accountId]: subscriptions,
  };
  await patchUserPreferences(userId, { calendarSubscriptions });
}

export async function getCalendarVisibility(
  userId: string,
): Promise<Record<string, boolean>> {
  const prefs = await getUserPreferences(userId);
  const raw = prefs.calendarVisibility;
  if (!raw || typeof raw !== "object") return {};
  return raw as Record<string, boolean>;
}

export async function setCalendarVisibilityMap(
  userId: string,
  visibility: Record<string, boolean>,
) {
  await patchUserPreferences(userId, { calendarVisibility: visibility });
}

export async function setCalendarVisible(
  userId: string,
  key: string,
  visible: boolean,
) {
  const prefs = await readUserPreferences(userId);
  const calendarVisibility = {
    ...((prefs.calendarVisibility as Record<string, boolean>) ?? {}),
    [key]: visible,
  };
  await patchUserPreferences(userId, { calendarVisibility });
}

export async function getCalendarSidebarExpanded(
  userId: string,
): Promise<boolean> {
  const prefs = await getUserPreferences(userId);
  return prefs.calendarSidebarExpanded !== false;
}

export async function setCalendarSidebarExpanded(
  userId: string,
  expanded: boolean,
) {
  await patchUserPreferences(userId, { calendarSidebarExpanded: expanded });
}

/** Subscribed calendars for sync — returns primary + connected account entries. */
export async function getSubscribedCalendarsForAccount(
  userId: string,
  accountId: string,
  accountEmail: string,
  sourceType: "google" | "caldav",
): Promise<CalendarSubscription[]> {
  const byAccount = await getSubscriptionsByAccount(userId);
  const subs = byAccount[accountId];
  if (subs && subs.length > 0) return subs;

  if (sourceType === "google") {
    return [{ calendarId: "primary", name: "Primary", color: "#4285F4", primary: true }];
  }
  // CalDAV: empty means pullCalDavAccount syncs all server calendars.
  return [];
}

/** All subscribed calendars merged for the calendar sidebar. */
export async function listSubscriptionViews(
  userId: string,
): Promise<CalendarSubscriptionView[]> {
  const { getConnectedAccounts } = await import("@/lib/connected-accounts");
  const user = await getUserRecord(userId);
  const byAccount = await getSubscriptionsByAccount(userId);
  const visibility = await getCalendarVisibility(userId);
  const views: CalendarSubscriptionView[] = [];

  if (user?.email && user.provider === "google") {
    const accountId = "primary-google";
    const subs =
      byAccount[accountId] ??
      (await getSubscribedCalendarsForAccount(
        userId,
        accountId,
        user.email,
        "google",
      ));
    for (const sub of subs) {
      const key = calendarSubscriptionKey(accountId, sub.calendarId);
      views.push({
        ...sub,
        accountId,
        accountEmail: user.email,
        sourceType: "google",
        key,
        visible: visibility[key] !== false,
      });
    }
  }

  const connected = await getConnectedAccounts(userId);
  for (const account of connected) {
    if (!account.connected) continue;
    if (account.type !== "google" && account.type !== "caldav") continue;

    const subs =
      byAccount[account.id] ??
      (account.type === "google"
        ? await getSubscribedCalendarsForAccount(
            userId,
            account.id,
            account.email,
            "google",
          )
        : []);

    for (const sub of subs) {
      const key = calendarSubscriptionKey(account.id, sub.calendarId);
      views.push({
        ...sub,
        accountId: account.id,
        accountEmail: account.email,
        sourceType: account.type as "google" | "caldav",
        key,
        visible: visibility[key] !== false,
      });
    }
  }

  return views;
}
