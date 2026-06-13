/** Months of history/future to pull on first sync (centered on today). */
export const SYNC_INITIAL_WINDOW_MONTHS = 3;

/** Each background extension adds this many months past or future. */
export const SYNC_EXTEND_CHUNK_MONTHS = 3;

/** Stop extending further than this many years into the past. */
export const SYNC_MAX_PAST_YEARS = 25;

/** Stop extending further than this many years into the future. */
export const SYNC_MAX_FUTURE_YEARS = 2;

export type CalendarSyncRangeState = {
  syncedStart: string;
  syncedEnd: string;
  pastComplete: boolean;
  futureComplete: boolean;
  lastExtendedAt?: string;
};

export function getInitialSyncWindow(now = new Date()): { end: Date; start: Date } {
  const start = new Date(now);
  start.setMonth(start.getMonth() - SYNC_INITIAL_WINDOW_MONTHS);
  start.setHours(0, 0, 0, 0);

  const end = new Date(now);
  end.setMonth(end.getMonth() + SYNC_INITIAL_WINDOW_MONTHS);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

export function createDefaultSyncRange(now = new Date()): CalendarSyncRangeState {
  const { start, end } = getInitialSyncWindow(now);
  return {
    syncedStart: start.toISOString(),
    syncedEnd: end.toISOString(),
    pastComplete: false,
    futureComplete: false,
  };
}

export function getNextPastChunk(
  state: CalendarSyncRangeState,
  now = new Date(),
): { end: Date; start: Date } | null {
  if (state.pastComplete) {
    return null;
  }

  const syncedStart = new Date(state.syncedStart);
  const chunkEnd = new Date(syncedStart);
  const chunkStart = new Date(syncedStart);
  chunkStart.setMonth(chunkStart.getMonth() - SYNC_EXTEND_CHUNK_MONTHS);

  const maxPast = new Date(now);
  maxPast.setFullYear(maxPast.getFullYear() - SYNC_MAX_PAST_YEARS);
  maxPast.setHours(0, 0, 0, 0);

  if (chunkStart <= maxPast) {
    if (syncedStart <= maxPast) {
      return null;
    }
    chunkStart.setTime(maxPast.getTime());
  }

  return { start: chunkStart, end: chunkEnd };
}

export function getNextFutureChunk(
  state: CalendarSyncRangeState,
  now = new Date(),
): { end: Date; start: Date } | null {
  if (state.futureComplete) {
    return null;
  }

  const syncedEnd = new Date(state.syncedEnd);
  const chunkStart = new Date(syncedEnd);
  const chunkEnd = new Date(syncedEnd);
  chunkEnd.setMonth(chunkEnd.getMonth() + SYNC_EXTEND_CHUNK_MONTHS);

  const maxFuture = new Date(now);
  maxFuture.setFullYear(maxFuture.getFullYear() + SYNC_MAX_FUTURE_YEARS);
  maxFuture.setHours(23, 59, 59, 999);

  if (chunkEnd >= maxFuture) {
    if (syncedEnd >= maxFuture) {
      return null;
    }
    chunkEnd.setTime(maxFuture.getTime());
  }

  return { start: chunkStart, end: chunkEnd };
}

export function isSyncRangeFullyExtended(state: CalendarSyncRangeState): boolean {
  return state.pastComplete && state.futureComplete;
}
