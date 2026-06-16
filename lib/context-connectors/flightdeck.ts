import "server-only";

import { searchFlightdeckTasks } from "@/lib/flightdeck-client";
import { towerSearchTasks } from "@/lib/tower-gateway";
import type { ContextTask } from "@/types/meeting-context";
import type { ConnectorContext, ConnectorResult } from "./types";

export async function connectFlightdeck(
  ctx: ConnectorContext,
): Promise<ConnectorResult<ContextTask[]>> {
  const { tasks, error } = await searchFlightdeckTasks({
    query: ctx.query || ctx.stream,
    streams: [ctx.stream, ...ctx.streams],
    participantEmails: ctx.participantEmails,
    limit: 20,
  });

  if (tasks.length > 0) {
    return { source: "flightdeck", data: tasks, error };
  }

  const tower = await towerSearchTasks({
    query: ctx.query || ctx.stream,
    streams: [ctx.stream, ...ctx.streams],
    participantEmails: ctx.participantEmails,
    limit: 20,
  });

  return {
    source: tower.error ? "tower" : "flightdeck",
    data: tower.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      stream: task.stream,
      url: task.url,
      source: "tower" as const,
    })),
    error: error ?? tower.error,
  };
}
