import {
  readFlightdeckBoardMirror,
  writeFlightdeckBoardMirror,
  writeMirrorMeta,
} from "@/lib/local-mirror/db";
import type { FlightdeckBoardPayload } from "@/types/flightdeck-board";

export async function hydrateFlightdeckMirrorFromServer(
  userId: string,
): Promise<FlightdeckBoardPayload | null> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return readFlightdeckBoardMirror(userId);
  }

  const res = await fetch("/api/flightdeck/board");
  if (!res.ok) {
    return readFlightdeckBoardMirror(userId);
  }

  const data = (await res.json()) as FlightdeckBoardPayload;
  await writeFlightdeckBoardMirror(userId, data);
  await writeMirrorMeta(userId, "flightdeck", {
    lastSyncAt: new Date().toISOString(),
  });
  return data;
}
