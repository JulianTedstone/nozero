import "server-only";

import { extractSenderEmail } from "@/lib/email-body";
import type {
  EmailMessage,
  EmailThreadDetail,
  EmailThreadSummary,
} from "@/types/email";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

type GmailHeader = { name: string; value: string };

type GmailPart = {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
};

type GmailMessage = {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: {
    headers?: GmailHeader[];
    mimeType?: string;
    body?: { data?: string };
    parts?: GmailPart[];
  };
};

type GmailThread = {
  id: string;
  snippet?: string;
  historyId?: string;
  messages?: GmailMessage[];
};

function decodeBase64Url(data: string): string {
  const padded = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64").toString("utf8");
}

function headersMap(message: GmailMessage): Record<string, string> {
  const map: Record<string, string> = {};
  for (const h of message.payload?.headers ?? []) {
    map[h.name.toLowerCase()] = h.value;
  }
  return map;
}

function parseAddressList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function extractBody(part: GmailPart | undefined): {
  plain: string;
  html: string | null;
} {
  if (!part) return { plain: "", html: null };

  const mime = part.mimeType?.toLowerCase() ?? "";
  if (mime === "text/plain" && part.body?.data) {
    return { plain: decodeBase64Url(part.body.data), html: null };
  }
  if (mime === "text/html" && part.body?.data) {
    return { plain: "", html: decodeBase64Url(part.body.data) };
  }

  let plain = "";
  let html: string | null = null;
  for (const child of part.parts ?? []) {
    const nested = extractBody(child);
    if (!plain && nested.plain) plain = nested.plain;
    if (!html && nested.html) html = nested.html;
    if (plain && html) break;
  }
  return { plain, html };
}

function messageToEmail(msg: GmailMessage): EmailMessage | null {
  const h = headersMap(msg);
  const from = h.from ?? "";
  const subject = h.subject ?? "(No subject)";
  const { plain, html } = extractBody(msg.payload);
  const date = msg.internalDate
    ? new Date(Number(msg.internalDate)).toISOString()
    : h.date ?? null;

  return {
    id: msg.id,
    threadId: msg.threadId,
    from,
    to: parseAddressList(h.to),
    cc: parseAddressList(h.cc),
    subject,
    body: plain || html || msg.snippet || "",
    bodyHtml: html,
    date,
  };
}

function participantsFromMessages(messages: GmailMessage[]): string[] {
  const set = new Set<string>();
  for (const msg of messages) {
    const h = headersMap(msg);
    if (h.from) set.add(extractSenderEmail(h.from));
    for (const addr of parseAddressList(h.to)) {
      set.add(extractSenderEmail(addr));
    }
    for (const addr of parseAddressList(h.cc)) {
      set.add(extractSenderEmail(addr));
    }
  }
  return [...set];
}

function threadToSummary(thread: GmailThread): EmailThreadSummary | null {
  const messages = thread.messages ?? [];
  if (messages.length === 0) return null;

  const sorted = [...messages].sort(
    (a, b) => Number(a.internalDate ?? 0) - Number(b.internalDate ?? 0),
  );
  const latest = sorted.at(-1)!;
  const h = headersMap(latest);
  const unread = messages.some((m) => m.labelIds?.includes("UNREAD"));

  return {
    id: thread.id,
    subject: h.subject ?? "(No subject)",
    snippet: thread.snippet ?? latest.snippet ?? null,
    date: latest.internalDate
      ? new Date(Number(latest.internalDate)).toISOString()
      : h.date ?? null,
    participants: participantsFromMessages(messages),
    unread,
    messageCount: messages.length,
  };
}

async function gmailFetch<T>(
  accessToken: string,
  path: string,
): Promise<{ data: T | null; error?: string }> {
  const res = await fetch(`${GMAIL_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(30_000),
  });

  if (res.status === 403) {
    return {
      data: null,
      error:
        "Gmail access denied — reconnect Google and allow Gmail read access",
    };
  }

  if (!res.ok) {
    const text = await res.text();
    return {
      data: null,
      error: `Gmail API ${res.status}: ${text.slice(0, 200)}`,
    };
  }

  return { data: (await res.json()) as T };
}

export async function listGmailThreadSummaries(
  accessToken: string,
  limit = 40,
): Promise<{ threads: EmailThreadSummary[]; error?: string }> {
  const list = await gmailFetch<{ threads?: Array<{ id: string }> }>(
    accessToken,
    `/threads?labelIds=INBOX&maxResults=${limit}`,
  );
  if (list.error) return { threads: [], error: list.error };
  if (!list.data?.threads?.length) return { threads: [] };

  const threads: EmailThreadSummary[] = [];
  for (const ref of list.data.threads) {
    const detail = await gmailFetch<GmailThread>(
      accessToken,
      `/threads/${encodeURIComponent(ref.id)}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
    );
    if (detail.error) continue;
    const summary = detail.data ? threadToSummary(detail.data) : null;
    if (summary) threads.push(summary);
  }

  threads.sort((a, b) => {
    const at = a.date ? new Date(a.date).getTime() : 0;
    const bt = b.date ? new Date(b.date).getTime() : 0;
    return bt - at;
  });

  if (threads.length === 0 && list.data.threads.length > 0) {
    return { threads: [], error: "Could not load Gmail thread metadata" };
  }

  return { threads };
}

export async function getGmailThreadDetail(
  accessToken: string,
  threadId: string,
): Promise<{ detail: EmailThreadDetail | null; error?: string }> {
  const result = await gmailFetch<GmailThread>(
    accessToken,
    `/threads/${encodeURIComponent(threadId)}?format=full`,
  );
  if (result.error) return { detail: null, error: result.error };
  if (!result.data?.messages?.length) {
    return { detail: null, error: "Thread not found" };
  }

  const summary = threadToSummary(result.data);
  if (!summary) return { detail: null, error: "Thread not found" };

  const messages = result.data.messages
    .map(messageToEmail)
    .filter((m): m is EmailMessage => m != null)
    .sort((a, b) => {
      const at = a.date ? new Date(a.date).getTime() : 0;
      const bt = b.date ? new Date(b.date).getTime() : 0;
      return at - bt;
    });

  return {
    detail: {
      thread: {
        ...summary,
        sender:
          messages.find((m) => m.from)?.from ??
          summary.participants[0] ??
          "Unknown",
        aiSummary: null,
        tracking: false,
        archived: false,
        accountEmail: "",
        streams: [],
      },
      messages,
    },
  };
}
