import { accountEmailFromGoogleLocalId } from "@/lib/google-calendar-ids";
import type { CalendarEvent } from "@/types/calendar";

type CalendarSubscription = {
  accountEmail?: string;
  id: string;
};

export type EventAccountEmailSource =
  | "google-id"
  | "calendar"
  | "attendee"
  | "stored"
  | "default-connected"
  | "login"
  | "none";

const CONFIDENT_SOURCES: ReadonlySet<EventAccountEmailSource> = new Set([
  "google-id",
  "calendar",
  "attendee",
]);

function uniqueEmails(emails: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const email of emails) {
    const trimmed = email.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function attendeeAccountMatch(
  event: CalendarEvent | null | undefined,
  connectedEmails: string[],
): string | undefined {
  if (!event?.attendees?.length || connectedEmails.length === 0) {
    return undefined;
  }
  const attendeeSet = new Set(
    event.attendees.map((attendee) => attendee.email.toLowerCase()),
  );
  for (const email of connectedEmails) {
    if (attendeeSet.has(email.toLowerCase())) return email;
  }
  return undefined;
}

function buildConnectedEmailList(
  connectedAccountEmails: string[],
  googleCalendars: CalendarSubscription[],
): string[] {
  const fromSubscriptions = googleCalendars
    .map((calendar) => calendar.accountEmail?.trim() ?? "")
    .filter(Boolean);
  return uniqueEmails([...connectedAccountEmails, ...fromSubscriptions]);
}

/**
 * Infer calendar account for an event with the signal that produced it.
 * High-confidence signals: google-id, calendar, attendee.
 */
export function inferEventAccountEmail(params: {
  connectedAccountEmails: string[];
  event?: CalendarEvent | null;
  googleCalendars: CalendarSubscription[];
  isCreating?: boolean;
  loginEmail?: string;
}): { email: string; source: EventAccountEmailSource } {
  const {
    connectedAccountEmails,
    event,
    googleCalendars,
    isCreating = false,
    loginEmail,
  } = params;

  const connectedEmails = buildConnectedEmailList(
    connectedAccountEmails,
    googleCalendars,
  );

  if (connectedEmails.length === 0) {
    const login = loginEmail?.trim();
    if (isCreating && login) {
      return { email: login, source: "login" };
    }
    return { email: "", source: "none" };
  }

  if (event?.id) {
    const fromLocalId = accountEmailFromGoogleLocalId(event.id, connectedEmails);
    if (fromLocalId) {
      return { email: fromLocalId, source: "google-id" };
    }
  }

  const calendarId = event?.calendarId?.trim();
  if (calendarId) {
    const calendar = googleCalendars.find((item) => item.id === calendarId);
    const accountEmail = calendar?.accountEmail?.trim();
    if (accountEmail) {
      return { email: accountEmail, source: "calendar" };
    }
  }

  const fromAttendees = attendeeAccountMatch(event, connectedEmails);
  if (fromAttendees) {
    return { email: fromAttendees, source: "attendee" };
  }

  const stored = event?.accountEmail?.trim();
  if (stored) {
    const normalized = stored.toLowerCase();
    if (connectedEmails.some((email) => email.toLowerCase() === normalized)) {
      return { email: stored, source: "stored" };
    }
  }

  if (isCreating) {
    const login = loginEmail?.trim();
    if (
      login &&
      connectedEmails.some((email) => email.toLowerCase() === login.toLowerCase())
    ) {
      return { email: login, source: "login" };
    }
    const primary =
      googleCalendars.find((calendar) => calendar.accountEmail)?.accountEmail ??
      googleCalendars[0]?.accountEmail;
    const email = primary?.trim() || connectedEmails[0] || "";
    return {
      email,
      source: email ? "default-connected" : "none",
    };
  }

  const fallback = connectedEmails[0] ?? "";
  return {
    email: fallback,
    source: fallback ? "default-connected" : "none",
  };
}

export function isConfidentAccountEmailSource(
  source: EventAccountEmailSource,
): boolean {
  return CONFIDENT_SOURCES.has(source);
}

export function eventAccountEmailNeedsRepair(
  event: CalendarEvent,
  inferred: { email: string; source: EventAccountEmailSource },
): boolean {
  if (!isConfidentAccountEmailSource(inferred.source) || !inferred.email) {
    return false;
  }
  const stored = event.accountEmail?.trim().toLowerCase() ?? "";
  const next = inferred.email.toLowerCase();
  return stored !== next;
}

/**
 * Resolve which connected calendar account owns or sourced an event.
 * Never falls back to the Supabase login email unless it is a connected calendar.
 */
export function resolveEventAccountEmail(params: {
  connectedAccountEmails: string[];
  event?: CalendarEvent | null;
  googleCalendars: CalendarSubscription[];
  isCreating?: boolean;
  loginEmail?: string;
}): string {
  return inferEventAccountEmail(params).email;
}
