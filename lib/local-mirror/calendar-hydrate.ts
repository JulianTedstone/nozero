import { upsertCalendarEvents, writeMirrorMeta } from "@/lib/local-mirror/db";
import { getInitialSyncWindow } from "@/lib/sync-window";
import type { CalendarEvent } from "@/types/calendar";

export async function hydrateCalendarMirrorFromServer(
  userId: string,
  range?: { end: Date; start: Date }
): Promise<number> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return 0;
  }

  const { start, end } = range ?? getInitialSyncWindow();
  const res = await fetch(
    `/api/calendar/events?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`
  );
  if (!res.ok) {
    return 0;
  }

  const data = (await res.json()) as { events?: CalendarEvent[] };
  const events = data.events ?? [];
  if (events.length > 0) {
    await upsertCalendarEvents(userId, events);
  }

  await writeMirrorMeta(userId, "calendar", {
    lastSyncAt: new Date().toISOString(),
  });

  return events.length;
}
