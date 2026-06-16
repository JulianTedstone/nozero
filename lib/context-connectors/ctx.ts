import "server-only";

import { ctxSearch } from "@/lib/ctx-gateway";
import type { ConnectorContext, ConnectorResult } from "./types";

export async function connectCtx(
  ctx: ConnectorContext,
): Promise<
  ConnectorResult<
    Array<{
      id: string;
      title: string;
      snippet: string | null;
    }>
  >
> {
  const { hits, error } = await ctxSearch({
    query: ctx.query || ctx.stream,
    repos: ctx.repos,
    streams: [ctx.stream, ...ctx.streams],
    limit: 12,
  });

  return {
    source: "ctx",
    data: hits.map((hit) => ({
      id: hit.id,
      title: hit.title,
      snippet: hit.snippet,
    })),
    error,
  };
}
