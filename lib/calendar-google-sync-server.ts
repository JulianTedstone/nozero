import { deleteEvent, type CalendarEvent } from "@/lib/calendar";
import {
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  updateGoogleCalendarEvent,
} from "@/lib/google-calendar";
import { getGoogleTokens } from "@/lib/google-tokens";
import { upsertUserEvent } from "@/lib/store";

type GoogleCalendarAuth = {
  accessToken: string;
  expiresAt: number;
  refreshToken: string;
};

/**
 * Read OAuth tokens for the user from nozero.profiles. Returns null when Google
 * is not linked. The underlying access-token refresh is handled inside
 * lib/google-calendar.ts using the refresh_token captured at sign-in.
 */
export async function getGoogleCalendarAuthForUser(
  userId: string,
): Promise<GoogleCalendarAuth | null> {
  const tokens = await getGoogleTokens(userId);
  if (!(tokens.accessToken && tokens.refreshToken)) {
    return null;
  }
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.accessTokenExpiresAt
      ? Math.floor(tokens.accessTokenExpiresAt / 1000)
      : 0,
  };
}

/**
 * After creating a local event, push it to Google when the account is linked.
 * Mirrors POST /api/calendar/events with pushToGoogle: true.
 */
export async function syncCreatedLocalEventToGoogle(
  userId: string,
  localEvent: CalendarEvent
): Promise<CalendarEvent> {
  let finalEvent = localEvent;
  const auth = await getGoogleCalendarAuthForUser(userId);
  if (!auth) {
    return finalEvent;
  }

  try {
    const syncedEvent = await createGoogleCalendarEvent(
      userId,
      auth.accessToken,
      auth.refreshToken,
      auth.expiresAt,
      localEvent,
      localEvent.calendarId
    );

    if (syncedEvent) {
      await deleteEvent(userId, localEvent.id);
      await upsertUserEvent(syncedEvent);
      finalEvent = syncedEvent;
    }
  } catch (error) {
    console.error("[calendar-google-sync] Failed to push created event to Google:", error);
  }

  return finalEvent;
}

/**
 * After updating an event locally, sync to Google when linked.
 * Mirrors PATCH /api/calendar/events/[id] with pushToGoogle: true.
 */
export async function syncUpdatedEventToGoogle(
  userId: string,
  existingBeforeUpdate: CalendarEvent,
  updatedEvent: CalendarEvent
): Promise<CalendarEvent> {
  let finalEvent = updatedEvent;
  const auth = await getGoogleCalendarAuthForUser(userId);
  if (!auth) {
    return finalEvent;
  }

  try {
    if (existingBeforeUpdate.source === "google") {
      const syncedEvent = await updateGoogleCalendarEvent(
        userId,
        auth.accessToken,
        auth.refreshToken,
        auth.expiresAt,
        updatedEvent,
        updatedEvent.calendarId ?? existingBeforeUpdate.calendarId
      );

      if (syncedEvent) {
        await upsertUserEvent(syncedEvent);
        finalEvent = syncedEvent;
      }
    } else {
      const syncedEvent = await createGoogleCalendarEvent(
        userId,
        auth.accessToken,
        auth.refreshToken,
        auth.expiresAt,
        updatedEvent,
        updatedEvent.calendarId
      );

      if (syncedEvent) {
        await deleteEvent(userId, updatedEvent.id);
        await upsertUserEvent(syncedEvent);
        finalEvent = syncedEvent;
      }
    }
  } catch (error) {
    console.error("[calendar-google-sync] Failed to push updated event to Google:", error);
  }

  return finalEvent;
}

/**
 * Remove the event from Google when it was linked there, before deleting locally.
 * Mirrors DELETE /api/calendar/events/[id]?pushToGoogle=true.
 */
export async function syncDeletedEventToGoogle(
  userId: string,
  existingEvent: CalendarEvent
): Promise<void> {
  if (!(existingEvent.source === "google" || existingEvent.sourceId)) {
    return;
  }

  const auth = await getGoogleCalendarAuthForUser(userId);
  if (!auth) {
    return;
  }

  try {
    await deleteGoogleCalendarEvent(
      userId,
      auth.accessToken,
      auth.refreshToken,
      auth.expiresAt,
      existingEvent.source === "google"
        ? existingEvent.id
        : `google_${existingEvent.sourceId}`,
      existingEvent.calendarId
    );
  } catch (error) {
    console.error("[calendar-google-sync] Failed to delete Google Calendar event:", error);
  }
}
