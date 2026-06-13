import "server-only";

import { NextResponse } from "next/server";
import { getCurrentAuthUser } from "@/lib/auth-server";
import {
  FLIGHTDECK_STATUS_ORDER,
  listFlightdeckBoard,
} from "@/lib/flightdeck-client";
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
  error?: string
): FlightdeckBoardPayload {
  const streams = [
    ...new Set(items.map((i) => i.stream).filter(Boolean) as string[]),
  ].sort();

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
    streams,
    items,
    source,
    error,
  };
}

export async function GET() {
  const user = await getCurrentAuthUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (towerConfigured()) {
    const tower = await towerQueryBoard();
    if (tower.items.length > 0) {
      return NextResponse.json(buildPayload(tower.items, "tower", tower.error));
    }
  }

  const github = await listFlightdeckBoard();
  return NextResponse.json(buildPayload(github.items, "github", github.error));
}
