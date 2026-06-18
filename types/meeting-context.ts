import type { CalendarEvent } from "@/types/calendar";

export interface ContextPerson {
  email: string;
  name: string | null;
  role: string | null;
  company: string | null;
  somaContactId: string | null;
  somaCompanyId: string | null;
  source: "attendee" | "stakeholder" | "soma" | "local";
}

export interface ContextCompany {
  id: string | null;
  name: string;
  domain: string | null;
  somaUrl: string | null;
}

export interface ContextDeal {
  id: string | null;
  name: string;
  stage: string | null;
  value: string | null;
}

export interface ContextMessage {
  id: string | null;
  subject: string;
  date: string | null;
  participants: string[];
  somaUrl: string | null;
  emailDeepLink: string | null;
}

export interface ContextTranscript {
  id: string;
  title: string;
  excerpt: string | null;
  /** Full transcript text when available (for source view). */
  fullText: string | null;
  source: "krisp";
  confidence: "high" | "medium" | "low";
}

export interface ContextAction {
  id: string;
  title: string;
  assignee: string | null;
  completed: boolean;
  source: "krisp";
}

export interface ContextTask {
  id: string;
  title: string;
  status: string | null;
  stream: string | null;
  url: string | null;
  source: "flightdeck" | "tower";
}

export interface ContextLink {
  label: string;
  url: string;
  type: "contact" | "company" | "deal" | "email" | "calendar" | "board" | "repo";
}

export interface MeetingContextBundle {
  eventId: string | null;
  title: string;
  start: string | null;
  end: string | null;
  stream?: {
    label: string;
    source: "flightdeck" | "soma" | "inferred" | "tower";
  };
  streams: string[];
  repos: string[];
  summary: {
    purpose: string | null;
    actionPoints: string[];
    recommendations: string[];
    sources: Array<"email" | "transcript" | "crm" | "ctx">;
  };
  people: ContextPerson[];
  companies: ContextCompany[];
  related: {
    deals: ContextDeal[];
    calendarEvents: CalendarEvent[];
  };
  messages: ContextMessage[];
  transcripts: ContextTranscript[];
  actions: ContextAction[];
  tasks: ContextTask[];
  links: ContextLink[];
  errors: Partial<
    Record<"soma" | "krisp" | "flightdeck" | "tower" | "ctx" | "calendar", string>
  >;
}
