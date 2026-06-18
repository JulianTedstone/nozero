import type {
  ContextCompany,
  ContextDeal,
  ContextPerson,
  ContextTask,
} from "@/types/meeting-context";

export type EmailFilterTab = "unread" | "tracking" | "all";

export interface MessageAiSummary {
  previousContext: string | null;
  summary: string;
  actions: Array<{ action: string; owner: string | null }>;
  suggestedResponse: string | null;
}

export interface EmailThreadSummary {
  id: string;
  subject: string;
  snippet: string | null;
  date: string | null;
  participants: string[];
  unread: boolean;
  messageCount: number;
}

export interface EmailThreadListItem extends EmailThreadSummary {
  sender: string;
  aiSummary: string | null;
  tracking: boolean;
  archived: boolean;
  accountEmail: string;
  streams: string[];
  threadIntent?: string | null;
}

export interface EmailMessage {
  id: string;
  threadId: string;
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  bodyHtml: string | null;
  bodyOriginal?: string | null;
  date: string | null;
  aiSummary?: MessageAiSummary | null;
  isMine?: boolean;
}

export interface EmailThreadDetail {
  thread: EmailThreadListItem;
  messages: EmailMessage[];
}

/** Structured thread digest produced by Context refresh. */
export interface ThreadDigest {
  topic: string | null;
  participants: string | null;
  development: string | null;
  state: string | null;
}

/** A task the digest suggests creating off the back of the thread. */
export interface SuggestedTask {
  title: string;
  rationale: string | null;
  stream: string | null;
}

export interface EmailThreadContext {
  subject: string;
  threadIntent: string | null;
  people: ContextPerson[];
  companies: ContextCompany[];
  deals: ContextDeal[];
  tasks: ContextTask[];
  streams: string[];
  summary: {
    text: string | null;
    sources: Array<"email" | "crm">;
  };
  digest?: ThreadDigest | null;
  suggestedTasks?: SuggestedTask[];
  errors: Partial<Record<"soma" | "flightdeck" | "summary", string>>;
}

export interface EmailAccountView {
  id: string;
  email: string;
  label: string;
  color: string;
  connected: boolean;
  visible: boolean;
  isPrimary: boolean;
}
