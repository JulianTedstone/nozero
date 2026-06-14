import "server-only";

import { NextResponse } from "next/server";
import { getCurrentAuthUser } from "@/lib/auth-server";
import {
  FLIGHTDECK_STATUS_ORDER,
  fetchFlightdeckFieldOptions,
  githubCommentsEnabled,
  listFlightdeckBoard,
} from "@/lib/flightdeck-client";
import { mergeFieldOptions } from "@/lib/flightdeck-field-options";
import { deriveFlightdeckOwners } from "@/lib/flightdeck-defaults";
import { towerConfigured, towerQueryBoard } from "@/lib/tower-mcp-client";
import type { FlightdeckBoardPayload } from "@/types/flightdeck-board";

export const runtime = "nodejs";
export const maxDuration = 30;

const DEFAULT_OWNER = "nopilot-co-studios";
const DEFAULT_PROJECT_NUMBER = 17;

function projectOwner(): string {
  return process.env.FLIGHTDECK_PROJECT_OWNER?.trim() || DEFAULT_OWNER;
}

function projectNumber(): number {
  const n = Number(process.env.FLIGHTDECK_PROJECT_NUMBER);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_PROJECT_NUMBER;
}

function buildPayload(
  items: FlightdeckBoardPayload["items"],
  source: FlightdeckBoardPayload["source"],
  actionsEnabled: boolean,
  fieldOptions: FlightdeckBoardPayload["fieldOptions"],
  error?: string,
): FlightdeckBoardPayload {
  const streams = [
    ...new Set(items.map((i) => i.stream).filter(Boolean) as string[]),
  ].sort();
  const owners = deriveFlightdeckOwners(items);

  const mergedOptions = mergeFieldOptions({
    ...fieldOptions,
    streams: [...new Set([...fieldOptions.streams, ...streams])],
    owners: [...new Set([...fieldOptions.owners, ...owners])],
  });

  const knownStatuses = new Set<string>(FLIGHTDECK_STATUS_ORDER);
  const extraStatuses = [
    ...new Set(
      items.map((i) => i.status).filter((s) => s && !knownStatuses.has(s))
    ),
  ].sort();

  const columns = [
    ...FLIGHTDECK_STATUS_ORDER.filter((col) =>
      items.some((i) => i.status === col)
    ),
    ...extraStatuses,
  ];

  if (columns.length === 0) {
    columns.push(...FLIGHTDECK_STATUS_ORDER);
  }

  return {
    projectNumber: projectNumber(),
    projectOwner: projectOwner(),
    columns,
    streams: mergedOptions.streams,
    owners: mergedOptions.owners,
    fieldOptions: mergedOptions,
    items,
    source,
    actionsEnabled,
    commentsEnabled: githubCommentsEnabled(),
    error,
  };
}

export async function GET() {
  const user = await getCurrentAuthUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actionsEnabled = towerConfigured();
  const fieldOptions = await fetchFlightdeckFieldOptions();

  if (actionsEnabled) {
    const tower = await towerQueryBoard();
    if (tower.items.length > 0) {
      return NextResponse.json(
        buildPayload(tower.items, "tower", true, fieldOptions, tower.error),
      );
    }
  }

  const github = await listFlightdeckBoard();
  return NextResponse.json(
    buildPayload(
      github.items,
      "github",
      actionsEnabled,
      fieldOptions,
      github.error,
    ),
  );
}
