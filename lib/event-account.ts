import { accountEmailFromGoogleLocalId } from "@/lib/google-calendar";
import type { CalendarEvent } from "@/types/calendar";

type CalendarSubscription = {
  accountEmail?: string;
  id: string;
};

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
  const {
    connectedAccountEmails,
    event,
    googleCalendars,
    isCreating = false,
    loginEmail,
  } = params;

  const fromSubscriptions = googleCalendars
    .map((calendar) => calendar.accountEmail?.trim() ?? "")
    .filter(Boolean);
  const connectedEmails = uniqueEmails([
    ...connectedAccountEmails,
    ...fromSubscriptions,
  ]);

  if (connectedEmails.length === 0) {
    return isCreating ? loginEmail?.trim() ?? "" : "";
  }

  if (event?.id) {
    const fromLocalId = accountEmailFromGoogleLocalId(event.id, connectedEmails);
    if (fromLocalId) return fromLocalId;
  }

  const calendarId = event?.calendarId?.trim();
  if (calendarId) {
    const calendar = googleCalendars.find((item) => item.id === calendarId);
    const accountEmail = calendar?.accountEmail?.trim();
    if (accountEmail) return accountEmail;
  }

  const fromAttendees = attendeeAccountMatch(event, connectedEmails);
  if (fromAttendees) return fromAttendees;

  const stored = event?.accountEmail?.trim();
  if (stored) {
    const normalized = stored.toLowerCase();
    if (connectedEmails.some((email) => email.toLowerCase() === normalized)) {
      return stored;
    }
  }

  if (isCreating) {
    const login = loginEmail?.trim();
    if (
      login &&
      connectedEmails.some((email) => email.toLowerCase() === login.toLowerCase())
    ) {
      return login;
    }
    const primary =
      googleCalendars.find((calendar) => calendar.accountEmail)?.accountEmail ??
      googleCalendars[0]?.accountEmail;
    return primary?.trim() || connectedEmails[0] || "";
  }

  return connectedEmails[0] ?? "";
}
