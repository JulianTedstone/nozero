export type IngestSection = "conversations" | "messaging" | "drops";

export interface IngestItemSummary {
  id: string; // `${repo}:${path}` — stable, used for read-state + selection
  section: IngestSection;
  repo: string; // owner/name
  path: string;
  channel: string; // krisp | email | slack | drop | …
  title: string; // best-effort label (filename-derived for the list)
  participantsLabel: string;
  date: string | null; // ISO date when derivable from the filename
  unread: boolean;
}

export interface IngestGroups {
  conversations: IngestItemSummary[];
  messaging: IngestItemSummary[];
  drops: IngestItemSummary[];
}

export interface IngestParticipant {
  name: string;
  email?: string;
  jobTitle?: string;
  company?: string;
}

export interface IngestAction {
  text: string;
  owner?: string;
  due?: string;
}

export interface IngestDeal {
  name: string;
  stage?: string;
}

export interface IngestConversation {
  id: string;
  repo: string;
  path: string;
  channel: string;
  title: string;
  date: string | null;
  time: string | null;
  durationMinutes: number | null;
  company: string | null;
  participants: IngestParticipant[];
  streams: string[];
  deals: IngestDeal[];
  summary: string;
  actions: IngestAction[];
  transcript: string;
  unread: boolean;
  /** Stream used as the default target when turning an action into a task. */
  defaultStream: string | null;
}
