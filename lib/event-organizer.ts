import type { CalendarEvent } from "@/types/calendar";

function normalizeEmail(email: string | undefined | null): string | null {
  const trimmed = email?.trim().toLowerCase();
  return trimmed || null;
}

/** True when the signed-in user can edit structural event fields. */
export function isUserEventOrganizer(
  event: CalendarEvent | null | undefined,
  userEmail: string | undefined,
  options?: { isCreating?: boolean },
): boolean {
  if (options?.isCreating) return true;
  if (!event) return true;

  const organizerEmail = normalizeEmail(event.organizerEmail);
  if (!organizerEmail) return true;

  const candidateEmails = new Set(
    [userEmail, event.accountEmail]
      .map(normalizeEmail)
      .filter((email): email is string => Boolean(email)),
  );

  return candidateEmails.has(organizerEmail);
}

export function organizerDisplayName(event: CalendarEvent | null | undefined): string {
  if (!event) return "Unknown";
  return (
    event.organizerName?.trim() ||
    event.organizerEmail?.trim() ||
    "the organiser"
  );
}
