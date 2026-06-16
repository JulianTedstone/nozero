import "server-only";

import type {
  ConnectedBundle,
  ConnectedEdge,
  ConnectedNode,
} from "@/types/context-connected";

function edge(
  from: string,
  to: string,
  relation: ConnectedEdge["relation"],
): ConnectedEdge {
  return { from, to, relation };
}

export function buildConnectedGraph(bundle: Omit<ConnectedBundle, "nodes" | "edges">): {
  nodes: ConnectedNode[];
  edges: ConnectedEdge[];
} {
  const nodes: ConnectedNode[] = [];
  const edges: ConnectedEdge[] = [];

  const centreId = bundle.path
    ? `file:${bundle.stream}:${bundle.path}`
    : `stream:${bundle.stream}`;

  nodes.push({
    id: centreId,
    kind: bundle.path ? "file" : "stream",
    title: bundle.path ?? bundle.stream,
    preview: bundle.summary,
  });

  for (const participant of bundle.sections.crm.participants) {
    const id = `person:${participant.email}`;
    nodes.push({
      id,
      kind: "person",
      title: participant.name ?? participant.email,
      preview: participant.company,
      meta: { email: participant.email },
    });
    edges.push(edge(centreId, id, "mentions"));
  }

  for (const deal of bundle.sections.crm.deals) {
    const id = `deal:${deal.id ?? deal.name}`;
    nodes.push({
      id,
      kind: "deal",
      title: deal.name,
      preview: deal.stage,
    });
    edges.push(edge(centreId, id, "related"));
  }

  for (const task of bundle.sections.tickets) {
    const id = `ticket:${task.id}`;
    nodes.push({
      id,
      kind: "ticket",
      title: task.title,
      preview: task.status,
      href: task.url,
      meta: { stream: task.stream },
    });
    edges.push(edge(centreId, id, bundle.path ? "same_stream" : "assigned"));
  }

  for (const message of bundle.sections.messages) {
    const id = `message:${message.id}`;
    nodes.push({
      id,
      kind: "message",
      title: message.subject,
      preview: message.sender,
      meta: { accountEmail: message.accountEmail },
    });
    edges.push(edge(centreId, id, "related"));
  }

  for (const event of bundle.sections.events) {
    const id = `event:${event.id}`;
    nodes.push({
      id,
      kind: "event",
      title: event.title ?? "Untitled",
      preview: event.start ?? null,
    });
    edges.push(edge(centreId, id, "attended"));
  }

  for (const transcript of bundle.sections.transcripts) {
    const id = `transcript:${transcript.id}`;
    nodes.push({
      id,
      kind: "transcript",
      title: transcript.title,
      preview: transcript.excerpt,
    });
    edges.push(edge(centreId, id, "semantic"));
  }

  for (const slack of bundle.sections.slack) {
    const id = `slack:${slack.id}`;
    nodes.push({
      id,
      kind: "slack",
      title: slack.channelName ?? slack.channelId,
      preview: slack.text,
      href: slack.permalink,
    });
    edges.push(edge(centreId, id, "semantic"));
  }

  for (const hit of bundle.sections.ctxHits) {
    const id = `ctx:${hit.id}`;
    nodes.push({
      id,
      kind: "ctx",
      title: hit.title,
      preview: hit.snippet,
    });
    edges.push(edge(centreId, id, "semantic"));
  }

  for (const action of bundle.sections.actions) {
    const id = `action:${action.id}`;
    nodes.push({
      id,
      kind: "action",
      title: action.title,
      preview: action.assignee,
      meta: { completed: action.completed },
    });
    edges.push(edge(centreId, id, "related"));
  }

  return { nodes, edges };
}
