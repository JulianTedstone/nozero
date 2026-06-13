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
