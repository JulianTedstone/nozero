import "server-only";

import {
  mergeContextBindings,
  reposForStream,
  streamsForAccount,
} from "@/lib/context-accounts";
import {
  fileContentFromWorkspace,
  readContextWorkspace,
} from "@/lib/context-workspace";
import type { ConnectedBundle, ConnectorSource } from "@/types/context-connected";
import type { ContextBindingsPreferences } from "@/types/context-accounts";
import { buildConnectedGraph } from "./build-graph";
import { connectCalendar } from "./calendar";
import { connectCrm } from "./crm";
import { connectCtx } from "./ctx";
import { connectEmail } from "./email";
import { connectFlightdeck } from "./flightdeck";
import { connectKrisp } from "./krisp";
import { connectSlack } from "./slack";
import {
  buildConnectorQuery,
  extractEmailsFromText,
  type ConnectorContext,
} from "./types";

export interface FetchConnectedInput {
  userId: string;
  userEmail: string | null;
  stream: string;
  path?: string | null;
  repo?: string | null;
  contextBindings?: ContextBindingsPreferences | null;
}

function streamUpdates(
  workspace: Awaited<ReturnType<typeof readContextWorkspace>>,
  stream: string,
) {
  return workspace.updates
    .filter((update) => update.stream === stream)
    .slice(0, 15)
    .map((update) => ({
      stream: update.stream,
      path: update.path,
      action: update.action,
      at: update.at,
    }));
}

export async function fetchConnectedBundle(
  input: FetchConnectedInput,
): Promise<ConnectedBundle> {
  const stream = input.stream.trim();
  const path = input.path?.trim() || null;
  const repo = input.repo?.trim() || null;

  const workspace = await readContextWorkspace(input.userId);
  const fileContent = fileContentFromWorkspace(workspace, stream, path);
  const summary = workspace.streams[stream]?.summary ?? null;

  const accountEmail = input.userEmail?.trim().toLowerCase() ?? "";
  const bindings = mergeContextBindings(
    accountEmail ? [accountEmail] : [],
    input.contextBindings ?? null,
  );
  const streamRepos = reposForStream(stream, bindings);
  const repos = [
    ...new Set([
      ...(repo ? [repo] : []),
      ...streamRepos.map((r) => r.fullName),
    ]),
  ];
  const streams = [
    ...new Set([
      stream,
      ...(accountEmail
        ? streamsForAccount(accountEmail, bindings)
        : bindings.flatMap((b) => b.streams)),
    ]),
  ];

  const query = buildConnectorQuery({ stream, path, fileContent });
  const participantEmails = extractEmailsFromText(fileContent);

  const ctx: ConnectorContext = {
    userId: input.userId,
    userEmail: input.userEmail,
    stream,
    path,
    repo,
    fileContent,
    summary,
    repos,
    streams,
    query,
    participantEmails,
  };

  const [
    crmResult,
    emailResult,
    calendarResult,
    flightdeckResult,
    ctxResult,
    krispResult,
    slackResult,
  ] = await Promise.all([
    connectCrm(ctx),
    connectEmail(ctx),
    connectCalendar(ctx),
    connectFlightdeck(ctx),
    connectCtx(ctx),
    connectKrisp(ctx),
    connectSlack(ctx),
  ]);

  const errors: Partial<Record<ConnectorSource, string>> = {};
  const recordError = (
    source: ConnectorSource,
    error: string | undefined,
  ) => {
    if (error?.trim()) {
      errors[source] = error;
    }
  };

  recordError(crmResult.source, crmResult.error);
  recordError(emailResult.source, emailResult.error);
  recordError(calendarResult.source, calendarResult.error);
  recordError(flightdeckResult.source, flightdeckResult.error);
  recordError(ctxResult.source, ctxResult.error);
  recordError(krispResult.source, krispResult.error);
  recordError(slackResult.source, slackResult.error);

  const partial: Omit<ConnectedBundle, "nodes" | "edges"> = {
    stream,
    path,
    repo,
    summary,
    query,
    sections: {
      updates: streamUpdates(workspace, stream),
      crm: crmResult.data,
      tickets: flightdeckResult.data,
      messages: emailResult.data,
      events: calendarResult.data,
      transcripts: krispResult.data.transcripts,
      actions: krispResult.data.actions,
      slack: slackResult.data,
      ctxHits: ctxResult.data,
    },
    errors,
  };

  const graph = buildConnectedGraph(partial);

  return {
    ...partial,
    nodes: graph.nodes,
    edges: graph.edges,
  };
}
