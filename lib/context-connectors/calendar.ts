import "server-only";

import { getEvents } from "@/lib/calendar";
import type { CalendarEvent } from "@/types/calendar";
import type { ConnectorContext, ConnectorResult } from "./types";

export async function connectCalendar(
  ctx: ConnectorContext,
): Promise<ConnectorResult<CalendarEvent[]>> {
  try {
    const now = new Date();
    const from = new Date(now);
    from.setDate(from.getDate() - 90);
    const to = new Date(now);
    to.setDate(to.getDate() + 90);

    const events = await getEvents(
      ctx.userId,
      from.toISOString(),
      to.toISOString(),
    );
    const streamNeedle = ctx.stream.toLowerCase();
    const queryNeedle = ctx.query.trim().toLowerCase();

    const filtered = events.filter((event) => {
      const title = (event.title ?? "").toLowerCase();
      if (title.includes(streamNeedle)) {
        return true;
      }
      if (queryNeedle.length >= 3 && title.includes(queryNeedle)) {
        return true;
      }
      if (ctx.participantEmails.length > 0) {
        const attendeeEmails = (event.attendees ?? []).map((a) =>
          a.email.toLowerCase(),
        );
        return ctx.participantEmails.some((email) =>
          attendeeEmails.includes(email.toLowerCase()),
        );
      }
      return false;
    });

    return {
      source: "calendar",
      data: filtered
        .sort(
          (a, b) => new Date(b.start).getTime() - new Date(a.start).getTime(),
        )
        .slice(0, 20) as CalendarEvent[],
    };
  } catch (error) {
    return {
      source: "calendar",
      data: [],
      error: error instanceof Error ? error.message : "Calendar fetch failed",
    };
  }
}
