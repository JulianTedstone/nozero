import "server-only";

import { listStoredThreads } from "@/lib/email-store";
import type { ConnectorContext, ConnectorResult } from "./types";

export async function connectEmail(
  ctx: ConnectorContext,
): Promise<
  ConnectorResult<
    Array<{
      id: string;
      subject: string;
      sender: string;
      date: string | null;
      accountEmail: string;
    }>
  >
> {
  const { threads, error } = await listStoredThreads({
    userId: ctx.userId,
    filter: "all",
    stream: ctx.stream,
    limit: 20,
    sync: false,
    q: ctx.query.length >= 3 ? ctx.query : undefined,
  });

  return {
    source: "email",
    data: threads.map((thread) => ({
      id: thread.id,
      subject: thread.subject,
      sender: thread.sender,
      date: thread.date,
      accountEmail: thread.accountEmail,
    })),
    error,
  };
}
