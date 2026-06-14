import { isUserEventOrganizer } from "@/lib/event-organizer";
import type { CalendarEvent } from "@/types/calendar";

export interface EventEditCapabilities {
  /** Title, time, location, recurrence, remove attendees, delete */
  canEditOrganizerFields: boolean;
  /** Add invitees (Google guest semantics) */
  canAddParticipants: boolean;
  /** Remove existing invitees */
  canRemoveParticipants: boolean;
  /** Project code, Flightdeck stream — per-user nozero metadata */
  canEditUserMetadata: boolean;
}

function normalizeEmail(email: string | null | undefined): string {
  return email?.trim().toLowerCase() ?? "";
}

/** True when the signed-in user appears on the attendee list. */
export function isUserEventAttendee(
  event: CalendarEvent | null | undefined,
  userEmail: string | null | undefined,
): boolean {
  const needle = normalizeEmail(userEmail);
  if (!needle || !event?.attendees?.length) return false;
  return event.attendees.some((a) => normalizeEmail(a.email) === needle);
}

export function getEventEditCapabilities(
  event: CalendarEvent | null | undefined,
  userEmail: string | null | undefined,
  options?: { isCreating?: boolean },
): EventEditCapabilities {
  const isCreating = options?.isCreating ?? false;
  const canEditOrganizerFields = isUserEventOrganizer(event, userEmail, {
    isCreating,
  });
  const onGuestList = isUserEventAttendee(event, userEmail);

  return {
    canEditOrganizerFields,
    canAddParticipants: canEditOrganizerFields || onGuestList,
    canRemoveParticipants: canEditOrganizerFields,
    canEditUserMetadata: Boolean(userEmail) && !isCreating,
  };
}
