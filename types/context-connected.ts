import type { CalendarEvent } from "@/types/calendar";
import type {
  ContextAction,
  ContextDeal,
  ContextMessage,
  ContextPerson,
  ContextTask,
  ContextTranscript,
} from "@/types/meeting-context";

export type ConnectorSource =
  | "workspace"
  | "ctx"
  | "crm"
  | "email"
  | "calendar"
  | "flightdeck"
  | "tower"
  | "krisp"
  | "slack";

export type ConnectedNodeKind =
  | "file"
  | "stream"
  | "person"
  | "company"
  | "deal"
  | "ticket"
  | "message"
  | "event"
  | "transcript"
  | "slack"
  | "ctx"
  | "action";

export type ConnectedEdgeRelation =
  | "same_stream"
  | "mentions"
  | "semantic"
  | "attended"
  | "assigned"
  | "related";

export interface ConnectedNode {
  id: string;
  kind: ConnectedNodeKind;
  title: string;
  preview?: string | null;
  href?: string | null;
  meta?: Record<string, string | number | boolean | null>;
}

export interface ConnectedEdge {
  from: string;
  to: string;
  relation: ConnectedEdgeRelation;
}

export interface ContextSlackMessage {
  id: string;
  channelId: string;
  channelName: string | null;
  text: string;
  userName: string | null;
  permalink: string | null;
  timestamp: string | null;
}

export interface ConnectedWorkspaceUpdate {
  stream: string;
  path: string;
  action: string;
  at: string;
}

export interface ConnectedBundle {
  stream: string;
  path: string | null;
  repo: string | null;
  summary: string | null;
  query: string;
  sections: {
    updates: ConnectedWorkspaceUpdate[];
    crm: {
      participants: ContextPerson[];
      deals: ContextDeal[];
    };
    tickets: ContextTask[];
    messages: Array<{
      id: string;
      subject: string;
      sender: string;
      date: string | null;
      accountEmail: string;
    }>;
    events: CalendarEvent[];
    transcripts: ContextTranscript[];
    actions: ContextAction[];
    slack: ContextSlackMessage[];
    ctxHits: Array<{
      id: string;
      title: string;
      snippet: string | null;
    }>;
  };
  nodes: ConnectedNode[];
  edges: ConnectedEdge[];
  errors: Partial<Record<ConnectorSource, string>>;
}
