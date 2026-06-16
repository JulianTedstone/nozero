const STORAGE_KEY = "nozero:flightdeck:board-prefs";

export type FlightdeckBoardPrefs = {
  pinnedStreams: string[];
  streamOrder: string[];
  hiddenStreams: Record<string, boolean>;
};

const EMPTY: FlightdeckBoardPrefs = {
  pinnedStreams: [],
  streamOrder: [],
  hiddenStreams: {},
};

export function readFlightdeckBoardPrefs(): FlightdeckBoardPrefs {
  if (typeof window === "undefined") {
    return EMPTY;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return EMPTY;
    }
    const parsed = JSON.parse(raw) as Partial<FlightdeckBoardPrefs>;
    return {
      pinnedStreams: Array.isArray(parsed.pinnedStreams)
        ? parsed.pinnedStreams.filter((s) => typeof s === "string")
        : [],
      streamOrder: Array.isArray(parsed.streamOrder)
        ? parsed.streamOrder.filter((s) => typeof s === "string")
        : [],
      hiddenStreams:
        parsed.hiddenStreams && typeof parsed.hiddenStreams === "object"
          ? (parsed.hiddenStreams as Record<string, boolean>)
          : {},
    };
  } catch {
    return EMPTY;
  }
}

export function writeFlightdeckBoardPrefs(prefs: FlightdeckBoardPrefs) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore quota errors
  }
}

export function mergeStreamOrder(
  saved: string[],
  labels: string[],
): string[] {
  const known = new Set(labels);
  const ordered = saved.filter((label) => known.has(label));
  const rest = [...labels].sort((a, b) => a.localeCompare(b));
  for (const label of rest) {
    if (!ordered.includes(label)) {
      ordered.push(label);
    }
  }
  return ordered;
}
