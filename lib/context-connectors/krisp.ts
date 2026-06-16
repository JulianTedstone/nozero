import "server-only";

import { krispContextForMeeting } from "@/lib/krisp-mcp-client";
import type { ContextAction, ContextTranscript } from "@/types/meeting-context";
import type { ConnectorContext, ConnectorResult } from "./types";

export async function connectKrisp(
  ctx: ConnectorContext,
): Promise<
  ConnectorResult<{
    transcripts: ContextTranscript[];
    actions: ContextAction[];
  }>
> {
  const { transcripts, actions, error } = await krispContextForMeeting(
    ctx.userId,
    {
      title: ctx.query || ctx.stream,
      attendeeEmails: ctx.participantEmails,
    },
  );

  return {
    source: "krisp",
    data: { transcripts, actions },
    error,
  };
}
