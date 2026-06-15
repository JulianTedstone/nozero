import { addMinutes, parseISO } from "date-fns";
import { format } from "date-fns-tz";
import ical from "ical-generator";
import { nanoid } from "nanoid";
import { RRule } from "rrule";
import { v4 as uuidv4 } from "uuid";
import {
  type RecurrenceEditScope,
  masterEventId,
  recurrenceRuleToRRuleOptions,
} from "@/lib/recurrence";
import {
  defaultCategories,
  deleteUserEvent,
  getGoogleAuth,
  getUserRecord,
  getUserTimezone as getStoredUserTimezone,
  getUserEvent,
  listUserCategories,
  listUserEvents,
  listUserEventsInRange,
  upsertUserCategory,
  upsertUserEvent,
  upsertUserRecord,
} from "@/lib/store";
import {
  createGoogleCalendarEvent,
  getGoogleCalendarEvents,
  updateGoogleCalendarEvent,
} from "./google-calendar";
import { pullAllCalendarAccounts } from "./google-accounts-sync";
import { repairEventAccountEmailsIfNeeded } from "@/lib/repair-event-account-emails";
import { isGoogleSignInUser } from "@/lib/auth-provider";

export interface RecurrenceRule {
  byDay?: string[];
  byMonth?: number[];
  byMonthDay?: number[];
  bySetPos?: number[];
  count?: number;
  exceptions?: string[];
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  interval: number;
  until?: string;
  weekStart?: string;
}

export interface CalendarEvent {
  allDay: boolean;
  attendees?: {
    email: string;
    name?: string;
    status?: "accepted" | "declined" | "tentative" | "needs-action";
  }[];
  calendarId?: string;
  categories?: string[];
  categoryId?: string;
  color?: string;
  conferenceUrl?: string;
  description?: string;
  end: string;
  exceptionDate?: string;
  exceptions?: {
    date: string;
    status: "cancelled" | "modified";
    modifiedEvent?: Omit<
      CalendarEvent,
      "id" | "userId" | "recurrence" | "exceptions"
    >;
  }[];
  id: string;
  isRecurring?: boolean;
  isRecurringInstance?: boolean;
  isShared?: boolean;
  location?: string;
  originalEventId?: string;
  recurrence?: RecurrenceRule;
  recurring?: {
    frequency: "daily" | "weekly" | "monthly" | "yearly";
    interval: number;
    endDate?: string;
    count?: number;
  };
  reminders?: { minutes: number; method: "email" | "popup" }[];
  sharedBy?: string;
  sharedWith?: string[];
  source?: "google" | "local" | "microsoft";
  sourceId?: string;
  start: string;
  timezone?: string;
  title: string;
  userId: string;
}

export interface CalendarCategory {
  color: string;
  id: string;
  name: string;
  userId: string;
  visible: boolean;
}

export function generateRecurringInstances(
  event: CalendarEvent,
  startRange: Date,
  endRange: Date,
  _timezone: string
): CalendarEvent[] {
  if (!event.recurrence) {
    return [event];
  }

  const eventStart = parseISO(event.start);
  const eventEnd = parseISO(event.end);
  const duration = eventEnd.getTime() - eventStart.getTime();

  const rruleOptions = recurrenceRuleToRRuleOptions(
    event.recurrence,
    eventStart
  );
  const rule = new RRule(rruleOptions);

  const occurrences = rule.between(startRange, endRange, true);

  const instances = occurrences.map((date) => {
    const instanceStart = new Date(date);
    const instanceEnd = new Date(instanceStart.getTime() + duration);

    const exceptionDate = event.exceptions?.find((ex) => {
      const exDate = parseISO(ex.date);
      return (
        exDate.getFullYear() === instanceStart.getFullYear() &&
        exDate.getMonth() === instanceStart.getMonth() &&
        exDate.getDate() === instanceStart.getDate()
      );
    });

    if (exceptionDate?.status === "cancelled") {
      return null;
    }

    if (exceptionDate?.status === "modified" && exceptionDate.modifiedEvent) {
      return {
        ...event,
        id: `${event.id}_${format(instanceStart, "yyyyMMdd")}`,
        start: exceptionDate.modifiedEvent.start,
        end: exceptionDate.modifiedEvent.end,
        title: exceptionDate.modifiedEvent.title || event.title,
        description:
          exceptionDate.modifiedEvent.description || event.description,
        location: exceptionDate.modifiedEvent.location || event.location,
        color: exceptionDate.modifiedEvent.color || event.color,
        isRecurringInstance: true,
        originalEventId: event.id,
        exceptionDate: exceptionDate.date,
      };
    }

    return {
      ...event,
      id: `${event.id}_${format(instanceStart, "yyyyMMdd")}`,
      start: instanceStart.toISOString(),
      end: instanceEnd.toISOString(),
      isRecurringInstance: true,
      originalEventId: event.id,
    };
  });

  return instances.filter(Boolean) as CalendarEvent[];
}

export async function getUserTimezone(userId: string): Promise<string> {
  return await getStoredUserTimezone(userId);
}

function adjustEventTimezone(
  event: CalendarEvent,
  fromTimezone: string,
  toTimezone: string
): CalendarEvent {
  if (fromTimezone === toTimezone || event.allDay) {
    return event;
  }

  try {
    const _startDate = new Date(event.start);
    const _endDate = new Date(event.end);

    return {
      ...event,
      timezone: toTimezone,
    };
  } catch (error) {
    console.error("Error adjusting event timezone:", error);
    return event;
  }
}

function _convertToUTC(date: Date, timezone: string): Date {
  const dateString = date.toISOString();

  const localDate = new Date(dateString);

  const tzOffset = getTimezoneOffset(localDate, timezone);

  const utcDate = new Date(localDate.getTime() - tzOffset * 60_000);

  return utcDate;
}

function getTimezoneOffset(date: Date, timezone: string): number {
  const _dateString = date.toISOString();

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  });

  const formattedParts = formatter.formatToParts(date);

  const components: Record<string, number> = {};
  formattedParts.forEach((part) => {
    if (part.type !== "literal") {
      components[part.type] = Number.parseInt(part.value, 10);
    }
  });

  const localDate = new Date(
    components.year,
    components.month - 1,
    components.day,
    components.hour,
    components.minute,
    components.second || 0
  );

  const offset = (date.getTime() - localDate.getTime()) / 60_000;

  return offset;
}

function masterMayOccurInRange(
  master: CalendarEvent,
  rangeStart: Date,
  rangeEnd: Date,
): boolean {
  if (!master.recurrence) return false;
  const masterStart = parseISO(master.start);
  if (masterStart > rangeEnd) return false;
  if (master.recurrence.until) {
    const until = parseISO(master.recurrence.until);
    if (until < rangeStart) return false;
  }
  return true;
}

export async function getEvents(
  userId: string,
  start: Date | string,
  end: Date | string
): Promise<CalendarEvent[]> {
  try {
    const user = await getUserRecord(userId);
    await repairEventAccountEmailsIfNeeded(userId, user?.email ?? undefined);

    const rangeStart =
      typeof start === "string" ? parseISO(start) : new Date(start);
    const rangeEnd = typeof end === "string" ? parseISO(end) : new Date(end);
    const timezone = await getUserTimezone(userId);

    const rangeEvents = await listUserEventsInRange(userId, start, end);
    const recurringMastersInRange = rangeEvents.filter((event) => event.recurrence);
    const nonRecurring = rangeEvents.filter((event) => !event.recurrence);

    const allEvents = await listUserEvents(userId);
    const extraMasters = allEvents.filter(
      (event) =>
        event.recurrence &&
        !recurringMastersInRange.some((master) => master.id === event.id) &&
        masterMayOccurInRange(event as CalendarEvent, rangeStart, rangeEnd),
    );

    const expanded: CalendarEvent[] = [];
    for (const master of [...recurringMastersInRange, ...extraMasters]) {
      expanded.push(
        ...generateRecurringInstances(
          master as CalendarEvent,
          rangeStart,
          rangeEnd,
          timezone,
        ),
      );
    }

    return [...nonRecurring, ...expanded].map((event) =>
      adjustEventTimezone(event, timezone),
    );
  } catch (error) {
    console.error("Error fetching events:", error);
    throw new Error("Failed to fetch events");
  }
}

export async function createEvent(
  eventOrUserId: Omit<CalendarEvent, "id"> | string,
  title?: string,
  start?: string,
  end?: string,
  description?: string,
  location?: string,
  color?: string
): Promise<CalendarEvent> {
  try {
    const event: Omit<CalendarEvent, "id"> =
      typeof eventOrUserId === "string"
        ? {
            userId: eventOrUserId,
            title: title || "Untitled Event",
            start: start || new Date().toISOString(),
            end: end || new Date(Date.now() + 30 * 60 * 1000).toISOString(),
            description,
            location,
            color,
            allDay: false,
            source: "local",
          }
        : eventOrUserId;

    console.log(
      "[Calendar] Creating event with details:",
      JSON.stringify({
        title: event.title,
        start: event.start,
        end: event.end,
        allDay: event.allDay,
      })
    );

    const startTime = new Date(event.start);
    const endTime = new Date(event.end);

    console.log("[Calendar] Start time:", startTime.toISOString());
    console.log("[Calendar] End time:", endTime.toISOString());

    const newEvent: CalendarEvent = {
      ...event,
      id: nanoid(),

      start: startTime.toISOString(),
      end: endTime.toISOString(),
      source: event.source || "local",
      allDay: event.allDay ?? false,
      isRecurring: Boolean(event.recurrence),
    };

    await upsertUserEvent(newEvent);

    console.log("[Calendar] Event created successfully:", newEvent.id);
    console.log("[Calendar] Final start time:", newEvent.start);
    console.log("[Calendar] Final end time:", newEvent.end);

    return newEvent;
  } catch (error) {
    console.error("Error creating event:", error);
    throw new Error("Failed to create event");
  }
}

export async function updateEvent(
  eventOrUserId: CalendarEvent | string,
  eventId?: string,
  updates?: Partial<CalendarEvent>
): Promise<CalendarEvent> {
  try {
    const event =
      typeof eventOrUserId === "string"
        ? await getUserEvent(eventOrUserId, eventId || "")
        : eventOrUserId;

    if (!event) {
      throw new Error("Event not found");
    }

    const updatedEvent = {
      ...event,
      ...(typeof eventOrUserId === "string" ? updates : {}),
      id: event.id,
      userId: event.userId,
      isRecurring: updates?.recurrence
        ? Boolean(updates.recurrence)
        : event.isRecurring ?? Boolean(event.recurrence),
    };

    await upsertUserEvent(updatedEvent);

    return updatedEvent;
  } catch (error) {
    console.error("Error updating event:", error);
    throw new Error("Failed to update event");
  }
}

export async function updateRecurringEvent(
  userId: string,
  event: CalendarEvent,
  updates: Partial<CalendarEvent>,
  scope: RecurrenceEditScope,
): Promise<CalendarEvent> {
  const resolvedMasterId = masterEventId(event);
  const master = await getUserEvent(userId, resolvedMasterId);

  if (!master?.recurrence) {
    return updateEvent(userId, event.id, updates);
  }

  const instanceStart = event.exceptionDate ?? event.start;

  if (scope === "all") {
    return updateEvent(userId, master.id, {
      ...updates,
      recurrence: updates.recurrence ?? master.recurrence,
    });
  }

  if (scope === "this") {
    const exceptions = [...(master.exceptions ?? [])];
    const existingIndex = exceptions.findIndex(
      (ex) => ex.date.slice(0, 10) === instanceStart.slice(0, 10),
    );
    const modifiedEvent: Omit<
      CalendarEvent,
      "id" | "userId" | "recurrence" | "exceptions"
    > = {
      title: updates.title ?? master.title,
      description: updates.description ?? master.description,
      start: updates.start ?? instanceStart,
      end: updates.end ?? master.end,
      location: updates.location ?? master.location,
      conferenceUrl: updates.conferenceUrl ?? master.conferenceUrl,
      allDay: updates.allDay ?? master.allDay,
      color: updates.color ?? master.color,
      attendees: updates.attendees ?? master.attendees,
      calendarId: updates.calendarId ?? master.calendarId,
    };

    const entry = {
      date: instanceStart,
      status: "modified" as const,
      modifiedEvent,
    };

    if (existingIndex >= 0) {
      exceptions[existingIndex] = entry;
    } else {
      exceptions.push(entry);
    }

    return updateEvent(userId, master.id, { exceptions });
  }

  // scope === "following" — end master series before this instance, start new series
  const instanceDate = parseISO(instanceStart);
  const dayBefore = new Date(instanceDate);
  dayBefore.setDate(dayBefore.getDate() - 1);
  dayBefore.setHours(23, 59, 59, 999);

  await updateEvent(userId, master.id, {
    recurrence: {
      ...master.recurrence,
      until: dayBefore.toISOString(),
      count: undefined,
    },
  });

  const duration = parseISO(master.end).getTime() - parseISO(master.start).getTime();
  const newStart = updates.start ?? instanceStart;
  const newEnd =
    updates.end ??
    new Date(parseISO(newStart).getTime() + duration).toISOString();

  const { id: _masterId, ...masterRest } = master;
  return createEvent({
    ...masterRest,
    ...updates,
    userId,
    start: newStart,
    end: newEnd,
    recurrence: updates.recurrence ?? master.recurrence,
    exceptions: undefined,
    isRecurring: true,
    isRecurringInstance: false,
    originalEventId: undefined,
    exceptionDate: undefined,
  });
}

export async function deleteRecurringEvent(
  userId: string,
  event: CalendarEvent,
  scope: RecurrenceEditScope,
): Promise<void> {
  const resolvedMasterId = masterEventId(event);
  const master = await getUserEvent(userId, resolvedMasterId);

  if (!master?.recurrence) {
    await deleteEvent(userId, event.id);
    return;
  }

  const instanceStart = event.exceptionDate ?? event.start;

  if (scope === "all") {
    await deleteEvent(userId, master.id);
    return;
  }

  if (scope === "this") {
    const exceptions = [...(master.exceptions ?? [])];
    exceptions.push({ date: instanceStart, status: "cancelled" });
    await updateEvent(userId, master.id, { exceptions });
    return;
  }

  // following — truncate series before this instance
  const instanceDate = parseISO(instanceStart);
  const dayBefore = new Date(instanceDate);
  dayBefore.setDate(dayBefore.getDate() - 1);
  dayBefore.setHours(23, 59, 59, 999);

  await updateEvent(userId, master.id, {
    recurrence: {
      ...master.recurrence,
      until: dayBefore.toISOString(),
      count: undefined,
    },
  });
}

export async function deleteEvent(
  userId: string,
  eventId: string
): Promise<void> {
  try {
    await deleteUserEvent(userId, eventId);
  } catch (error) {
    console.error("Error deleting event:", error);
    throw new Error("Failed to delete event");
  }
}

export async function searchEvents(
  userId: string,
  query: string
): Promise<CalendarEvent[]> {
  const allEvents = await listUserEvents(userId);

  const timezone = await getUserTimezone(userId);

  const queryLower = query.toLowerCase();
  const matchingEvents = allEvents.filter((event) => {
    return (
      event.title.toLowerCase().includes(queryLower) ||
      event.description?.toLowerCase().includes(queryLower) ||
      event.location?.toLowerCase().includes(queryLower)
    );
  });

  const userData = await getGoogleAuth(userId);
  const googleLogin = await isGoogleSignInUser(userId);
  const hasGoogleCalendar =
    googleLogin &&
    userData?.accessToken &&
    userData?.refreshToken;

  if (hasGoogleCalendar) {
    try {
      const start = new Date(0);
      const end = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365);

      const googleEvents = await getGoogleCalendarEvents(
        userId,
        userData.accessToken as string,
        userData.refreshToken as string,
        userData.expiresAt as number,
        start,
        end
      );

      const matchingGoogleEvents = googleEvents.filter((event) => {
        return (
          event.title.toLowerCase().includes(queryLower) ||
          event.description?.toLowerCase().includes(queryLower) ||
          event.location?.toLowerCase().includes(queryLower)
        );
      });

      const allMatchingEvents = [...matchingEvents, ...matchingGoogleEvents];
      const uniqueEvents = allMatchingEvents.filter(
        (event, index, self) =>
          index === self.findIndex((e) => e.id === event.id)
      );

      return uniqueEvents.map((event) =>
        adjustEventTimezone(event as CalendarEvent, timezone)
      );
    } catch (error) {
      console.error("Error searching Google Calendar:", error);
    }
  }

  return matchingEvents.map((event) =>
    adjustEventTimezone(event as CalendarEvent, timezone)
  );
}

export async function exportToICS(
  userId: string,
  start?: Date,
  end?: Date
): Promise<string> {
  const userTimezone = await getUserTimezone(userId);

  const events = await getEvents(
    userId,
    start || new Date(0),
    end || new Date(Date.now() + 1000 * 60 * 60 * 24 * 365)
  );

  const calendar = ical({
    name: "nozero",
    timezone: userTimezone,
  });

  events.forEach((event) => {
    if (event.isRecurringInstance) {
      return;
    }

    const icalEvent = calendar.createEvent({
      id: event.id,
      start: new Date(event.start),
      end: new Date(event.end),
      summary: event.title,
      description: event.description,
      location: event.location,
      timezone: event.timezone || userTimezone,
      allDay: event.allDay,
    });

    if (event.recurrence) {
      const rruleOptions = recurrenceRuleToRRuleOptions(
        event.recurrence,
        new Date(event.start)
      );
      const rule = new RRule(rruleOptions);
      icalEvent.repeating(rule.toString());

      if (event.exceptions) {
        event.exceptions.forEach((exception) => {
          if (exception.status === "cancelled") {
            icalEvent.exdate(new Date(exception.date));
          } else if (
            exception.status === "modified" &&
            exception.modifiedEvent
          ) {
            calendar.createEvent({
              id: `${event.id}_exception_${new Date(exception.date).toISOString()}`,
              start: new Date(exception.modifiedEvent.start || event.start),
              end: new Date(exception.modifiedEvent.end || event.end),
              summary: exception.modifiedEvent.title || event.title,
              description:
                exception.modifiedEvent.description || event.description,
              location: exception.modifiedEvent.location || event.location,
              timezone: event.timezone || userTimezone,
              allDay: exception.modifiedEvent.allDay || event.allDay,
              recurrenceId: new Date(exception.date),
            });
          }
        });
      }
    }

    if (event.attendees) {
      event.attendees.forEach((attendee) => {
        icalEvent.createAttendee({
          email: attendee.email,
          name: attendee.name,
          status: attendee.status as any,
        });
      });
    }

    if (event.categories) {
      icalEvent.categories(event.categories);
    }
  });

  return calendar.toString();
}

export async function importFromICS(
  userId: string,
  icsData: string
): Promise<{ imported: number; errors: number }> {
  const userTimezone = await getUserTimezone(userId);
  let imported = 0;
  let errors = 0;

  try {
    const parseICS = (icsData) => {
      const events: Record<string, Record<string, unknown>> = {};
      const lines = icsData.split("\n");
      let currentEvent: Record<string, unknown> | null = null;

      for (const rawLine of lines) {
        const line = rawLine.trim();

        if (line === "BEGIN:VEVENT") {
          currentEvent = { type: "VEVENT" };
        } else if (line === "END:VEVENT" && currentEvent) {
          const uid = currentEvent.uid || `event_${Object.keys(events).length}`;
          events[uid] = currentEvent;
          currentEvent = null;
        } else if (currentEvent) {
          const [key, value] = line.split(":");
          if (key && value) {
            if (key === "DTSTART") {
              currentEvent.start = new Date(value);
            } else if (key === "DTEND") {
              currentEvent.end = new Date(value);
            } else if (key === "SUMMARY") {
              currentEvent.summary = value;
            } else if (key === "DESCRIPTION") {
              currentEvent.description = value;
            } else if (key === "LOCATION") {
              currentEvent.location = value;
            } else if (key === "UID") {
              currentEvent.uid = value;
            }
          }
        }
      }

      return events;
    };

    const parsedEvents = parseICS(icsData);

    for (const key in parsedEvents) {
      if (!Object.hasOwn(parsedEvents, key)) {
        continue;
      }
      const parsedEvent = parsedEvents[key];

      if (parsedEvent.type !== "VEVENT") {
        continue;
      }

      try {
        const event: CalendarEvent = {
          id: `imported_${uuidv4()}`,
          title: parsedEvent.summary || "Untitled Event",
          description: parsedEvent.description,
          start: parsedEvent.start.toISOString(),
          end: parsedEvent.end.toISOString(),
          location: parsedEvent.location,
          userId,
          source: "local",
          timezone: parsedEvent.timezone || userTimezone,
          allDay: parsedEvent.allDay,
        };

        if (parsedEvent.rrule) {
          const rrule = parsedEvent.rrule.toString();

          let frequency: "daily" | "weekly" | "monthly" | "yearly" = "daily";
          if (rrule.includes("FREQ=DAILY")) {
            frequency = "daily";
          }
          if (rrule.includes("FREQ=WEEKLY")) {
            frequency = "weekly";
          }
          if (rrule.includes("FREQ=MONTHLY")) {
            frequency = "monthly";
          }
          if (rrule.includes("FREQ=YEARLY")) {
            frequency = "yearly";
          }

          const intervalMatch = rrule.match(/INTERVAL=(\d+)/);
          const interval = intervalMatch
            ? Number.parseInt(intervalMatch[1], 10)
            : 1;

          const countMatch = rrule.match(/COUNT=(\d+)/);
          const count = countMatch
            ? Number.parseInt(countMatch[1], 10)
            : undefined;

          const untilMatch = rrule.match(/UNTIL=(\d+T\d+Z)/);
          const until = untilMatch
            ? new Date(untilMatch[1]).toISOString()
            : undefined;

          const byDayMatch = rrule.match(/BYDAY=([^;]+)/);
          const byDay = byDayMatch ? byDayMatch[1].split(",") : undefined;

          const byMonthDayMatch = rrule.match(/BYMONTHDAY=([^;]+)/);
          const byMonthDay = byMonthDayMatch
            ? byMonthDayMatch[1].split(",").map(Number)
            : undefined;

          const byMonthMatch = rrule.match(/BYMONTH=([^;]+)/);
          const byMonth = byMonthMatch
            ? byMonthMatch[1].split(",").map(Number)
            : undefined;

          event.recurrence = {
            frequency,
            interval,
            count,
            until,
            byDay,
            byMonthDay,
            byMonth,
          };

          if (parsedEvent.exdate) {
            event.exceptions = [];

            const exdates = Array.isArray(parsedEvent.exdate)
              ? parsedEvent.exdate
              : [parsedEvent.exdate];

            exdates.forEach((exdate) => {
              event.exceptions?.push({
                date: exdate.toISOString(),
                status: "cancelled",
              });
            });
          }
        }

        await createEvent(event);
        imported++;
      } catch (error) {
        console.error("Error importing event:", error);
        errors++;
      }
    }

    return { imported, errors };
  } catch (error) {
    console.error("Error parsing ICS data:", error);
    return { imported, errors: 1 };
  }
}

export async function exportToCSV(
  userId: string,
  start?: Date,
  end?: Date
): Promise<string> {
  const _userTimezone = await getUserTimezone(userId);

  const events = await getEvents(
    userId,
    start || new Date(0),
    end || new Date(Date.now() + 1000 * 60 * 60 * 24 * 365)
  );

  let csv =
    "Subject,Start Date,Start Time,End Date,End Time,All Day,Description,Location,Categories\n";

  events.forEach((event) => {
    const startDate = new Date(event.start);
    const endDate = new Date(event.end);

    const startDateFormatted = format(startDate, "MM/dd/yyyy");
    const startTimeFormatted = event.allDay ? "" : format(startDate, "HH:mm");
    const endDateFormatted = format(endDate, "MM/dd/yyyy");
    const endTimeFormatted = event.allDay ? "" : format(endDate, "HH:mm");

    const escapeCSV = (field = "") => `"${field.replace(/"/g, '""')}"`;

    csv += `${[
      escapeCSV(event.title),
      startDateFormatted,
      startTimeFormatted,
      endDateFormatted,
      endTimeFormatted,
      event.allDay ? "TRUE" : "FALSE",
      escapeCSV(event.description),
      escapeCSV(event.location),
      escapeCSV(event.categories?.join(", ")),
    ].join(",")}\n`;
  });

  return csv;
}

export async function importFromCSV(
  userId: string,
  csvData: string
): Promise<{ imported: number; errors: number }> {
  const userTimezone = await getUserTimezone(userId);
  let imported = 0;
  let errors = 0;

  try {
    const rows = csvData.split("\n");
    const headers = rows[0].split(",");

    const getColumnIndex = (name: string) => {
      const index = headers.findIndex((h) =>
        h.toLowerCase().includes(name.toLowerCase())
      );
      return index >= 0 ? index : null;
    };

    const subjectIndex = getColumnIndex("subject") || getColumnIndex("title");
    const startDateIndex = getColumnIndex("start date");
    const startTimeIndex = getColumnIndex("start time");
    const endDateIndex = getColumnIndex("end date");
    const endTimeIndex = getColumnIndex("end time");
    const allDayIndex = getColumnIndex("all day");
    const descriptionIndex = getColumnIndex("description");
    const locationIndex = getColumnIndex("location");
    const categoriesIndex = getColumnIndex("categories");

    if (subjectIndex === null || startDateIndex === null) {
      throw new Error(
        "CSV must contain at least Subject/Title and Start Date columns"
      );
    }

    for (let i = 1; i < rows.length; i++) {
      if (!rows[i].trim()) {
        continue;
      }

      try {
        const row = rows[i].split(",");

        const parseField = (index: number | null) => {
          if (index === null || index >= row.length) {
            return "";
          }

          let value = row[index].trim();

          if (value.startsWith('"') && value.endsWith('"')) {
            value = value.substring(1, value.length - 1).replace(/""/g, '"');
          }

          return value;
        };

        const title = parseField(subjectIndex);
        const startDateStr = parseField(startDateIndex);
        const startTimeStr =
          startTimeIndex === null ? "" : parseField(startTimeIndex);
        const endDateStr =
          endDateIndex === null ? startDateStr : parseField(endDateIndex);
        const endTimeStr =
          endTimeIndex === null
            ? startTimeStr
              ? addMinutes(parseISO(`${startDateStr}T${startTimeStr}`), 30)
                  .toISOString()
                  .substring(11, 16)
              : ""
            : parseField(endTimeIndex);
        const allDayStr =
          allDayIndex === null ? "" : parseField(allDayIndex).toLowerCase();
        const description =
          descriptionIndex === null ? "" : parseField(descriptionIndex);
        const location =
          locationIndex === null ? "" : parseField(locationIndex);
        const categoriesStr =
          categoriesIndex === null ? "" : parseField(categoriesIndex);

        const startDate = parseISO(
          `${startDateStr}${startTimeStr ? `T${startTimeStr}` : "T00:00:00"}`
        );
        const endDate = parseISO(
          `${endDateStr}${endTimeStr ? `T${endTimeStr}` : "T23:59:59"}`
        );

        const allDay =
          allDayStr === "true" ||
          allDayStr === "yes" ||
          allDayStr === "1" ||
          !startTimeStr;

        const categories = categoriesStr
          ? categoriesStr.split(",").map((c) => c.trim())
          : [];

        const event: CalendarEvent = {
          id: `imported_${uuidv4()}`,
          title,
          description,
          start: startDate.toISOString(),
          end: endDate.toISOString(),
          location,
          userId,
          source: "local",
          timezone: userTimezone,
          allDay,
          categories: categories.length > 0 ? categories : undefined,
        };

        await createEvent(event);
        imported++;
      } catch (error) {
        console.error("Error importing event from CSV row:", error);
        errors++;
      }
    }

    return { imported, errors };
  } catch (error) {
    console.error("Error parsing CSV data:", error);
    return { imported, errors: 1 };
  }
}

export async function getUserCategories(
  userId: string
): Promise<CalendarCategory[]> {
  try {
    return await listUserCategories(userId);
  } catch (error) {
    console.error("Error fetching categories:", error);
    throw new Error("Failed to fetch categories");
  }
}

export async function getSharedEvents(
  _userId: string,
  _start?: Date,
  _end?: Date
): Promise<CalendarEvent[]> {
  return [];
}

export async function syncWithGoogleCalendar(
  userId: string,
  googleAuth?: {
    accessToken: string;
    refreshToken: string;
    expiresAt?: number | null;
  },
  options?: { pullOnly?: boolean },
): Promise<{
  success: boolean;
  message: string;
  pulled?: number;
  deleted?: number;
  accounts?: number;
  errors?: string[];
}> {
  try {
    const userData = googleAuth
      ? {
          accessToken: googleAuth.accessToken,
          refreshToken: googleAuth.refreshToken,
          expiresAt: googleAuth.expiresAt ?? 0,
        }
      : await getGoogleAuth(userId);

    const googleLogin = await isGoogleSignInUser(userId);
    const hasPrimaryGoogle =
      googleLogin &&
      userData?.accessToken &&
      userData?.refreshToken;

    if (!hasPrimaryGoogle) {
      const linked = await pullAllCalendarAccounts(userId);
      if (linked.accounts === 0) {
        return {
          success: false,
          message:
            "Google Calendar is not connected. Please connect your Google account first.",
        };
      }
      if (linked.pulled === 0 && linked.errors.length > 0) {
        return {
          success: false,
          message: linked.errors.join("; "),
          pulled: linked.pulled,
          deleted: linked.deleted,
          accounts: linked.accounts,
          errors: linked.errors,
        };
      }
      await upsertUserRecord({ userId, lastGoogleSync: Date.now() });
      const caldavMessage =
        `✓ Sync completed for ${linked.accounts} connected account(s).\n` +
        `Pulled ${linked.pulled} events (${linked.deleted} removed locally).` +
        (linked.errors.length ? `\nWarnings: ${linked.errors.join("; ")}` : "");
      return {
        success: true,
        message: caldavMessage,
        pulled: linked.pulled,
        deleted: linked.deleted,
        accounts: linked.accounts,
        errors: linked.errors,
      };
    }

    const { initializeCalendarSyncRange } = await import(
      "@/lib/google-accounts-sync"
    );
    await initializeCalendarSyncRange(userId);

    // 1. PULL: all linked Google accounts (primary + additional).
    const inboundPull = await pullAllCalendarAccounts(userId, {
      googleOnly: options?.pullOnly === true,
    });

    if (options?.pullOnly) {
      await upsertUserRecord({ userId, lastGoogleSync: Date.now() });
      return {
        success: true,
        message:
          `✓ Pulled ${inboundPull.pulled} event change(s) from ${inboundPull.accounts} account(s).` +
          (inboundPull.errors.length
            ? `\nWarnings: ${inboundPull.errors.join("; ")}`
            : ""),
        pulled: inboundPull.pulled,
        deleted: inboundPull.deleted,
        accounts: inboundPull.accounts,
        errors: inboundPull.errors,
      };
    }

    // 2. PUSH: Get local events and sync them to Google Calendar
    const localEvents = await listUserEvents(userId);
    const googleEvents = localEvents.filter((event) => event.source === "google");

    // Filter out events that are already from Google to avoid duplicates
    const nonGoogleLocalEvents = localEvents.filter(
      (event) => event.source !== "google"
    );

    const syncedGoogleIds = new Set(googleEvents.map((event) => event.id));

    let created = 0;
    let updated = 0;
    let deleted = inboundPull.deleted;
    const pulled = inboundPull.pulled;

    // Push local events to Google Calendar
    for (const event of nonGoogleLocalEvents) {
      try {
        // Match by stored Google ID first, then fall back to title/time.
        const existingGoogleEvent = googleEvents.find(
          (ge) =>
            ge.sourceId === event.sourceId ||
            (ge.title === event.title &&
              new Date(ge.start).getTime() === new Date(event.start).getTime())
        );

        if (existingGoogleEvent) {
          const syncedEvent = await updateGoogleCalendarEvent(
            userId,
            userData.accessToken as string,
            userData.refreshToken as string,
            userData.expiresAt as number,
            { ...event, id: existingGoogleEvent.id, sourceId: existingGoogleEvent.sourceId },
            event.calendarId ?? existingGoogleEvent.calendarId
          );

          if (syncedEvent) {
            await deleteUserEvent(userId, event.id);
            await upsertUserEvent(syncedEvent);
            updated++;
          }
        } else {
          const syncedEvent = await createGoogleCalendarEvent(
            userId,
            userData.accessToken as string,
            userData.refreshToken as string,
            userData.expiresAt as number,
            event,
            event.calendarId
          );

          if (syncedEvent) {
            await deleteUserEvent(userId, event.id);
            await upsertUserEvent(syncedEvent);
            created++;
          }
        }
      } catch (error) {
        console.error("Error syncing local event to Google Calendar:", error);
      }
    }

    // Update last sync timestamp
    await upsertUserRecord({ userId, lastGoogleSync: Date.now() });

    const message =
      "✓ Sync completed successfully.\n" +
      `Synced ${inboundPull.accounts} Google account(s); processed ${pulled} inbound changes.\n` +
      `Pushed ${created} new + ${updated} updated events to Google Calendar.\n` +
      `Removed ${deleted} deleted Google events locally.` +
      (inboundPull.errors.length
        ? `\nWarnings: ${inboundPull.errors.join("; ")}`
        : "");

    return {
      success: true,
      message,
      pulled,
      deleted,
      accounts: inboundPull.accounts,
      errors: inboundPull.errors,
    };
  } catch (error) {
    console.error("Error syncing with Google Calendar:", error);
    const message =
      error instanceof Error
        ? error.message
        : "An error occurred while syncing with Google Calendar. Please try again later.";
    return {
      success: false,
      message,
      errors: [message],
    };
  }
}

export async function hasGoogleCalendarConnected(
  userId: string
): Promise<boolean> {
  const userData = await getGoogleAuth(userId);
  const googleLogin = await isGoogleSignInUser(userId);
  return !!(
    googleLogin &&
    userData?.accessToken &&
    userData?.refreshToken
  );
}

export async function createCalendar(calendar: {
  userId: string;
  name: string;
  color: string;
}): Promise<CalendarCategory> {
  try {
    const newCalendar: CalendarCategory = {
      ...calendar,
      id: nanoid(),
      visible: true,
    };

    await upsertUserCategory(newCalendar);
    return newCalendar;
  } catch (error) {
    console.error("Error creating calendar:", error);
    throw new Error("Failed to create calendar");
  }
}

export async function toggleCalendarVisibility(
  userId: string,
  calendarId: string
): Promise<void> {
  try {
    const calendars = await listUserCategories(userId);

    if (!calendars || calendars.length === 0) {
      const seededDefaults = defaultCategories.map((calendar) => ({
        ...calendar,
        userId,
      }));

      const calendarIndex = seededDefaults.findIndex(
        (cal) => cal.id === calendarId
      );

      if (calendarIndex === -1) {
        throw new Error(`Calendar with ID ${calendarId} not found`);
      }

      seededDefaults[calendarIndex].visible =
        !seededDefaults[calendarIndex].visible;
      await Promise.all(
        seededDefaults.map((calendar) => upsertUserCategory(calendar))
      );

      return;
    }

    const calendarIndex = calendars.findIndex((cal) => cal.id === calendarId);

    if (calendarIndex === -1) {
      throw new Error(`Calendar with ID ${calendarId} not found`);
    }

    const updatedCalendars = [...calendars];
    updatedCalendars[calendarIndex] = {
      ...updatedCalendars[calendarIndex],
      visible: !updatedCalendars[calendarIndex].visible,
    };

    await upsertUserCategory(updatedCalendars[calendarIndex]);
  } catch (error) {
    console.error("Error toggling calendar visibility:", error);
    throw new Error("Failed to toggle calendar visibility");
  }
}

export async function getEvent(
  userId: string,
  eventId: string
): Promise<CalendarEvent | null> {
  try {
    return await getUserEvent(userId, eventId);
  } catch (error) {
    console.error("Error fetching event:", error);
    return null;
  }
}

function _formatDateTimeForInput(
  dateStr: string,
  _timezone?: string,
  allDay?: boolean
): string {
  try {
    const date = parseISO(dateStr);

    if (allDay) {
      return format(date, "yyyy-MM-dd");
    }

    return format(date, "yyyy-MM-dd'T'HH:mm");
  } catch (error) {
    console.error("Error formatting date:", error);
    return dateStr;
  }
}

export async function getTodayEvents(userId: string): Promise<CalendarEvent[]> {
  try {
    const today = new Date();
    const startOfToday = new Date(today);
    startOfToday.setHours(0, 0, 0, 0);

    const endOfToday = new Date(today);
    endOfToday.setHours(23, 59, 59, 999);

    return await getEvents(userId, startOfToday, endOfToday);
  } catch (error) {
    console.error("Error fetching today's events:", error);
    return [];
  }
}
