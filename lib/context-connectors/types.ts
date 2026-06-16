import "server-only";

import type { ConnectorSource } from "@/types/context-connected";

export interface ConnectorContext {
  userId: string;
  userEmail: string | null;
  stream: string;
  path: string | null;
  repo: string | null;
  fileContent: string | null;
  summary: string | null;
  repos: string[];
  streams: string[];
  query: string;
  participantEmails: string[];
}

export interface ConnectorResult<T> {
  source: ConnectorSource;
  data: T;
  error?: string;
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

export function extractEmailsFromText(text: string | null | undefined): string[] {
  if (!text?.trim()) {
    return [];
  }
  const found = text.match(EMAIL_RE) ?? [];
  return [...new Set(found.map((e) => e.toLowerCase()))];
}

export function buildConnectorQuery(input: {
  stream: string;
  path: string | null;
  fileContent: string | null;
}): string {
  const basename =
    input.path
      ?.split("/")
      .pop()
      ?.replace(/\.[^.]+$/, "")
      ?.replace(/[-_]/g, " ") ?? "";
  const firstHeading =
    input.fileContent
      ?.split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0)
      ?.replace(/^#+\s*/, "") ?? "";
  return [input.stream, basename, firstHeading]
    .filter((part) => part.trim().length > 0)
    .join(" ")
    .slice(0, 240);
}
