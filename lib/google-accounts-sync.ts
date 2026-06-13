import { listGoogleAccountsForSync } from "@/lib/connected-accounts";
import { getConnectedAccounts } from "@/lib/connected-accounts";
import {
  getSubscribedCalendarsForAccount,
  getSubscriptionsByAccount,
} from "@/lib/calendar-subscriptions";
import {
  markExtensionApplied,
  ensureCalendarSyncRange,
  getCalendarSyncRange,
  getPendingExtensionChunks,
  isSyncRangeFullyExtended,
} from "@/lib/calendar-sync-range";
import {
  syncGoogleCalendarEventsIncrementally,
  syncGoogleCalendarEventsInRange,
} from "@/lib/google-calendar";
import {
  getConnectedAccountTokens,
  getValidAccessToken,
} from "@/lib/google-tokens";
import { getInitialSyncWindow } from "@/lib/sync-window";

/** Pull calendar events from every linked Google account (primary + connected). */
export async function pullAllGoogleCalendarAccounts(
  userId: string,
  options?: { timeRange?: { end: Date; start: Date } },
): Promise<{
  pulled: number;
  deleted: number;
  accounts: number;
  errors: string[];
}> {
  const linked = await listGoogleAccountsForSync(userId);
  const connected = await getConnectedAccountTokens(userId);
  const connectedByEmail = new Map(
    connected.map((t) => [t.email.toLowerCase(), t]),
  );

  let pulled = 0;
  let deleted = 0;
  const errors: string[] = [];
  const connectedAccounts = await getConnectedAccounts(userId);
  const subscriptionsByAccount = await getSubscriptionsByAccount(userId);
  const windowRange = options?.timeRange ?? getInitialSyncWindow();

  for (const account of linked) {
    try {
      let accessToken = account.accessToken;
      if (!account.isPrimary) {
        const token = connectedByEmail.get(account.email.toLowerCase());
        if (token) {
          const refreshed = await getValidAccessToken(userId, token);
          if (refreshed) accessToken = refreshed;
        }
      }

      const accountId = account.isPrimary
        ? "primary-google"
        : connectedAccounts.find(
            (a) => a.email.toLowerCase() === account.email.toLowerCase(),
          )?.id;

      if (!accountId) {
        errors.push(`${account.email}: missing account metadata`);
        continue;
      }

      const subscribed =
        subscriptionsByAccount[accountId] ??
        (await getSubscribedCalendarsForAccount(
          userId,
          accountId,
          account.email,
          "google",
        ));

      for (const cal of subscribed) {
        if (options?.timeRange) {
          const rangeResult = await syncGoogleCalendarEventsInRange({
            userId,
            accessToken,
            refreshToken: account.refreshToken,
            expiresAt: account.expiresAt,
            accountEmail: account.email,
            calendarId: cal.calendarId,
            start: windowRange.start,
            end: windowRange.end,
          });
          pulled += rangeResult.pulled;
          continue;
        }

        const result = await syncGoogleCalendarEventsIncrementally({
          userId,
          accessToken,
          refreshToken: account.refreshToken,
          expiresAt: account.expiresAt,
          accountEmail: account.email,
          isPrimary: account.isPrimary,
          initialSyncToken:
            cal.calendarId === "primary"
              ? (account.googleSyncToken ?? null)
              : null,
          calendarId: cal.calendarId,
        });

        pulled += result.events.length;
        deleted += result.deleted;
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown sync error";
      errors.push(`${account.email}: ${message}`);
      console.error(
        "[google-accounts-sync] pull failed for",
        account.email,
        error,
      );
    }
  }

  return { pulled, deleted, accounts: linked.length, errors };
}

/** Pull from all external calendar sources (Google + CalDAV). */
export async function pullAllCalendarAccounts(
  userId: string,
  options?: {
    googleOnly?: boolean;
    timeRange?: { end: Date; start: Date };
  },
): Promise<{
  pulled: number;
  deleted: number;
  accounts: number;
  errors: string[];
}> {
  const google = await pullAllGoogleCalendarAccounts(userId, options);
  let caldav = { pulled: 0, deleted: 0, accounts: 0, errors: [] as string[] };

  if (!options?.googleOnly) {
    const { pullAllCalDavAccounts } = await import("@/lib/caldav-sync");
    if (options?.timeRange) {
      caldav = await pullAllCalDavAccounts(userId, options.timeRange);
    } else {
      caldav = await pullAllCalDavAccounts(userId);
    }
  }

  return {
    pulled: google.pulled + caldav.pulled,
    deleted: google.deleted + caldav.deleted,
    accounts: google.accounts + caldav.accounts,
    errors: [...google.errors, ...caldav.errors],
  };
}

/** Extend stored sync window by one chunk past and/or future (background). */
export async function extendCalendarSyncWindow(userId: string): Promise<{
  pulled: number;
  errors: string[];
  pastComplete: boolean;
  futureComplete: boolean;
  extended: boolean;
}> {
  const state = await getCalendarSyncRange(userId);
  const chunks = getPendingExtensionChunks(state);

  if (chunks.length === 0) {
    return {
      pulled: 0,
      errors: [],
      pastComplete: state.pastComplete,
      futureComplete: state.futureComplete,
      extended: false,
    };
  }

  let pulled = 0;
  const errors: string[] = [];
  let latestState = state;

  for (const chunk of chunks) {
    const result = await pullAllCalendarAccounts(userId, {
      timeRange: { start: chunk.start, end: chunk.end },
    });
    pulled += result.pulled;
    errors.push(...result.errors);
    latestState = await markExtensionApplied(userId, chunk.direction, chunk);
  }

  return {
    pulled,
    errors,
    pastComplete: latestState.pastComplete,
    futureComplete: latestState.futureComplete,
    extended: true,
  };
}

export async function initializeCalendarSyncRange(
  userId: string,
): Promise<void> {
  await ensureCalendarSyncRange(userId);
}

export async function getCalendarSyncRangeStatus(userId: string): Promise<{
  pastComplete: boolean;
  futureComplete: boolean;
  fullyExtended: boolean;
  syncedStart: string;
  syncedEnd: string;
}> {
  const state = await getCalendarSyncRange(userId);
  return {
    pastComplete: state.pastComplete,
    futureComplete: state.futureComplete,
    fullyExtended: isSyncRangeFullyExtended(state),
    syncedStart: state.syncedStart,
    syncedEnd: state.syncedEnd,
  };
}

export async function hasAnyGoogleCalendarLinked(
  userId: string,
): Promise<boolean> {
  const linked = await listGoogleAccountsForSync(userId);
  return linked.length > 0;
}

/** Google OAuth and/or connected CalDAV accounts that can be synced. */
export async function hasAnyCalendarLinked(userId: string): Promise<boolean> {
  if (await hasAnyGoogleCalendarLinked(userId)) return true;
  const accounts = await getConnectedAccounts(userId);
  return accounts.some(
    (a) => a.connected && (a.type === "google" || a.type === "caldav"),
  );
}
