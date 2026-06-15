import { getConnectedAccounts } from "@/lib/connected-accounts";
import { listSubscriptionViews } from "@/lib/calendar-subscriptions";
import {
  eventAccountEmailNeedsRepair,
  inferEventAccountEmail,
} from "@/lib/event-account";
import { listUserEvents, upsertUserEvent } from "@/lib/store";
import { readUserPreferences, patchUserPreferences } from "@/lib/user-preferences";
import type { CalendarEvent } from "@/types/calendar";

/** Bump when repair heuristics change and a re-scan is needed. */
export const ACCOUNT_EMAIL_REPAIR_VERSION = 1;

export type RepairEventAccountEmailsResult = {
  repaired: number;
  scanned: number;
  skipped: boolean;
};

/**
 * One-time (version-gated) backfill for events whose `accountEmail` was set to
 * the login identity or another wrong connected account.
 */
export async function repairEventAccountEmailsIfNeeded(
  userId: string,
  loginEmail?: string,
): Promise<RepairEventAccountEmailsResult> {
  const prefs = await readUserPreferences(userId);
  const doneVersion =
    typeof prefs.accountEmailRepairVersion === "number"
      ? prefs.accountEmailRepairVersion
      : 0;

  if (doneVersion >= ACCOUNT_EMAIL_REPAIR_VERSION) {
    return { scanned: 0, repaired: 0, skipped: true };
  }

  const [events, connectedAccounts, subscriptionViews] = await Promise.all([
    listUserEvents(userId),
    getConnectedAccounts(userId),
    listSubscriptionViews(userId),
  ]);

  const connectedAccountEmails = connectedAccounts
    .filter(
      (account) =>
        account.connected !== false &&
        (account.type === "google" || account.type === "caldav"),
    )
    .map((account) => account.email);

  const googleCalendars = subscriptionViews.map((view) => ({
    id: view.calendarId,
    accountEmail: view.accountEmail,
  }));

  let repaired = 0;

  for (const event of events) {
    const inferred = inferEventAccountEmail({
      connectedAccountEmails,
      event,
      googleCalendars,
      loginEmail,
    });

    if (!eventAccountEmailNeedsRepair(event, inferred)) {
      continue;
    }

    const fixed: CalendarEvent = {
      ...event,
      accountEmail: inferred.email,
    };
    await upsertUserEvent(fixed);
    repaired += 1;
  }

  await patchUserPreferences(userId, {
    accountEmailRepairVersion: ACCOUNT_EMAIL_REPAIR_VERSION,
  });

  return {
    scanned: events.length,
    repaired,
    skipped: false,
  };
}
