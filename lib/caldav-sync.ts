import ical from "node-ical";
import { createDAVClient } from "tsdav";
import type { CalendarEvent } from "@/types/calendar";
import { getInitialSyncWindow } from "@/lib/sync-window";
import { upsertUserEvent } from "@/lib/store";

export function caldavLocalEventId(
  accountEmail: string,
  uid: string,
): string {
  const slug = accountEmail.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const safeUid = uid.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `caldav_${slug}_${safeUid}`;
}

function normalizeServerUrl(serverUrl: string): string {
  return serverUrl.trim().replace(/\/$/, "");
}

export async function createCalDavClient(creds: {
  serverUrl: string;
  username: string;
  password: string;
}) {
  const client = await createDAVClient({
    serverUrl: normalizeServerUrl(creds.serverUrl),
    credentials: {
      username: creds.username,
      password: creds.password,
    },
    authMethod: "Basic",
    defaultAccountType: "caldav",
  });
  return client;
}

export async function testCalDavConnection(creds: {
  serverUrl: string;
  username: string;
  password: string;
}): Promise<{ calendarCount: number; calendarNames: string[] }> {
  const client = await createCalDavClient(creds);
  const calendars = await client.fetchCalendars();
  return {
    calendarCount: calendars.length,
    calendarNames: calendars.map(
      (cal) => cal.displayName ?? cal.url ?? "Calendar",
    ),
  };
}

function parseIcsToEvents(
  icsData: string,
  userId: string,
  accountEmail: string,
  calendarId: string,
): CalendarEvent[] {
  const parsed = ical.parseICS(icsData);
  const events: CalendarEvent[] = [];

  for (const key of Object.keys(parsed)) {
    const item = parsed[key];
    if (!item || item.type !== "VEVENT") continue;

    const uid = item.uid ?? key;
    const startDate = item.start instanceof Date ? item.start : null;
    const endDate = item.end instanceof Date ? item.end : startDate;
    if (!startDate) continue;

    events.push({
      id: caldavLocalEventId(accountEmail, uid),
      title: item.summary ?? "(No title)",
      description: typeof item.description === "string" ? item.description : undefined,
      start: startDate.toISOString(),
      end: (endDate ?? startDate).toISOString(),
      location: typeof item.location === "string" ? item.location : undefined,
      userId,
      source: "caldav",
      sourceId: uid,
      accountEmail,
      calendarId,
      allDay: item.datetype === "date",
      timezone: "UTC",
    });
  }

  return events;
}

export async function pullCalDavAccount(params: {
  userId: string;
  accountEmail: string;
  serverUrl: string;
  username: string;
  password: string;
  calendarIds?: string[];
  timeRange?: { end: Date; start: Date };
}): Promise<{ pulled: number; errors: string[] }> {
  const errors: string[] = [];
  let pulled = 0;

  try {
    const client = await createCalDavClient({
      serverUrl: params.serverUrl,
      username: params.username,
      password: params.password,
    });

    const calendars = await client.fetchCalendars();
    const subscribedIds = params.calendarIds?.length
      ? new Set(params.calendarIds)
      : null;
    const selected = subscribedIds
      ? calendars.filter((cal) => {
          const id = cal.url ?? cal.displayName ?? "default";
          return subscribedIds.has(id);
        })
      : calendars;

    if (selected.length === 0) {
      return { pulled: 0, errors: ["No subscribed calendars found on server"] };
    }

    const defaultWindow = getInitialSyncWindow();
    const rangeStart = params.timeRange?.start ?? defaultWindow.start;
    const rangeEnd = params.timeRange?.end ?? defaultWindow.end;

    for (const calendar of selected) {
      const calendarId = calendar.url ?? calendar.displayName ?? "default";
      try {
        const objects = await client.fetchCalendarObjects({
          calendar,
          timeRange: {
            start: rangeStart.toISOString(),
            end: rangeEnd.toISOString(),
          },
        });

        for (const object of objects) {
          if (!object.data) continue;
          const events = parseIcsToEvents(
            object.data,
            params.userId,
            params.accountEmail,
            calendarId,
          );
          for (const event of events) {
            await upsertUserEvent(event);
            pulled++;
          }
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Calendar fetch failed";
        errors.push(`${calendar.displayName ?? calendarId}: ${message}`);
      }
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "CalDAV connection failed";
    errors.push(message);
  }

  return { pulled, errors };
}

export async function pullAllCalDavAccounts(
  userId: string,
  timeRange?: { end: Date; start: Date },
): Promise<{
  pulled: number;
  deleted: number;
  accounts: number;
  errors: string[];
}> {
  const { getConnectedAccounts } = await import("@/lib/connected-accounts");
  const { listCalDavCredentials } = await import("@/lib/caldav-credentials");
  const {
    getSubscribedCalendarsForAccount,
    getSubscriptionsByAccount,
  } = await import("@/lib/calendar-subscriptions");

  const accounts = await getConnectedAccounts(userId);
  const subscriptionsByAccount = await getSubscriptionsByAccount(userId);
  const credsByEmail = new Map(
    (await listCalDavCredentials(userId)).map((c) => [c.email.toLowerCase(), c]),
  );

  let pulled = 0;
  const errors: string[] = [];
  let accountCount = 0;

  for (const account of accounts) {
    if (account.type !== "caldav" || !account.connected) continue;
    const creds = credsByEmail.get(account.email.toLowerCase());
    if (!creds) {
      errors.push(`${account.email}: missing stored credentials — reconnect`);
      continue;
    }

    accountCount++;
    const subscribed =
      subscriptionsByAccount[account.id] ??
      (await getSubscribedCalendarsForAccount(
        userId,
        account.id,
        account.email,
        "caldav",
      ));

    const result = await pullCalDavAccount({
      userId,
      accountEmail: account.email,
      serverUrl: creds.serverUrl,
      username: creds.username,
      password: creds.password,
      calendarIds: subscribed.map((s) => s.calendarId),
      timeRange,
    });
    pulled += result.pulled;
    errors.push(...result.errors.map((e) => `${account.email}: ${e}`));
  }

  return { pulled, deleted: 0, accounts: accountCount, errors };
}
