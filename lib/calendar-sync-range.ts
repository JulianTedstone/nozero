import {
  createDefaultSyncRange,
  getNextFutureChunk,
  getNextPastChunk,
  isSyncRangeFullyExtended,
  type CalendarSyncRangeState,
} from "@/lib/sync-window";
import { getUserPreferences, saveUserPreferences } from "@/lib/store";

const PREFS_KEY = "calendarSyncRange";

function parseSyncRange(raw: unknown): CalendarSyncRangeState | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const value = raw as Record<string, unknown>;
  if (
    typeof value.syncedStart !== "string" ||
    typeof value.syncedEnd !== "string"
  ) {
    return null;
  }

  return {
    syncedStart: value.syncedStart,
    syncedEnd: value.syncedEnd,
    pastComplete: value.pastComplete === true,
    futureComplete: value.futureComplete === true,
    lastExtendedAt:
      typeof value.lastExtendedAt === "string"
        ? value.lastExtendedAt
        : undefined,
  };
}

export async function getCalendarSyncRange(
  userId: string,
): Promise<CalendarSyncRangeState> {
  const prefs = await getUserPreferences(userId);
  return parseSyncRange(prefs[PREFS_KEY]) ?? createDefaultSyncRange();
}

export async function saveCalendarSyncRange(
  userId: string,
  state: CalendarSyncRangeState,
): Promise<void> {
  await saveUserPreferences(userId, { [PREFS_KEY]: state });
}

export async function ensureCalendarSyncRange(
  userId: string,
): Promise<CalendarSyncRangeState> {
  const prefs = await getUserPreferences(userId);
  const existing = parseSyncRange(prefs[PREFS_KEY]);
  if (existing) {
    return existing;
  }

  const initial = createDefaultSyncRange();
  await saveCalendarSyncRange(userId, initial);
  return initial;
}

export function getPendingExtensionChunks(state: CalendarSyncRangeState): Array<{
  direction: "past" | "future";
  end: Date;
  start: Date;
}> {
  const chunks: Array<{ direction: "past" | "future"; end: Date; start: Date }> =
    [];

  const past = getNextPastChunk(state);
  if (past) {
    chunks.push({ direction: "past", ...past });
  }

  const future = getNextFutureChunk(state);
  if (future) {
    chunks.push({ direction: "future", ...future });
  }

  return chunks;
}

export async function markExtensionApplied(
  userId: string,
  direction: "past" | "future",
  chunk: { end: Date; start: Date },
): Promise<CalendarSyncRangeState> {
  const current = await getCalendarSyncRange(userId);
  const now = new Date();

  const nextPastComplete =
    direction === "past"
      ? getNextPastChunk(
          {
            ...current,
            syncedStart: chunk.start.toISOString(),
          },
          now,
        ) === null
      : current.pastComplete;

  const nextFutureComplete =
    direction === "future"
      ? getNextFutureChunk(
          {
            ...current,
            syncedEnd: chunk.end.toISOString(),
          },
          now,
        ) === null
      : current.futureComplete;

  const updated: CalendarSyncRangeState = {
    syncedStart:
      direction === "past" ? chunk.start.toISOString() : current.syncedStart,
    syncedEnd:
      direction === "future" ? chunk.end.toISOString() : current.syncedEnd,
    pastComplete: nextPastComplete,
    futureComplete: nextFutureComplete,
    lastExtendedAt: now.toISOString(),
  };

  await saveCalendarSyncRange(userId, updated);
  return updated;
}

export { isSyncRangeFullyExtended };
