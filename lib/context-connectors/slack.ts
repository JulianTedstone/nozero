import "server-only";

import { searchSlackMessages } from "@/lib/slack-client";
import type { ContextSlackMessage } from "@/types/context-connected";
import type { ConnectorContext, ConnectorResult } from "./types";

export async function connectSlack(
  ctx: ConnectorContext,
): Promise<ConnectorResult<ContextSlackMessage[]>> {
  const query = [ctx.stream, ctx.query].filter(Boolean).join(" ");
  const { messages, error } = await searchSlackMessages({
    query,
    limit: 12,
  });

  return {
    source: "slack",
    data: messages,
    error,
  };
}
