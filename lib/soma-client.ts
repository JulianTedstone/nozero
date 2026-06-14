import "server-only";

import {
  fetchHydrationContactByEmail,
  getHydrationConfig,
  getHydrationEmailThread,
  hydrationBaseUrl,
  listHydrationEmailThreads,
  searchHydrationCompaniesByDomain,
  searchHydrationContacts,
  searchHydrationDeals,
  searchHydrationMessages,
} from "@/lib/hydration-client";

import type {
  EmailMessage,
  EmailThreadDetail,
  EmailThreadSummary,
} from "@/types/email";
import type {
  ContextCompany,
  ContextDeal,
  ContextMessage,
  ContextPerson,
} from "@/types/meeting-context";

const TIMEOUT_MS = 4000;

export type SomaContactSuggestion = {
  email: string;
  name: string | null;
  company: string | null;
  source: "soma" | "messages";
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getSomaConfig() {
  const baseUrl = process.env.NOZERO_SOMA_ANANSI_URL?.replace(/\/$/, "");
  const apiKey = process.env.NOZERO_SOMA_ANANSI_SECRET_API_KEY;
  if (!(baseUrl && apiKey)) {
    return null;
  }
  return { baseUrl, apiKey };
}

export function somaBaseUrl(): string {
  const hydration = hydrationBaseUrl();
  if (hydration) {
    return hydration;
  }
  return process.env.NOZERO_SOMA_ANANSI_URL?.replace(/\/$/, "") ?? "";
}

async function somaFetch(url: string, apiKey: string): Promise<unknown | null> {
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch {
    return null;
  }
}

function extractContactRecords(payload: unknown): Record<string, unknown>[] {
  if (!payload) {
    return [];
  }

  if (Array.isArray(payload)) {
    return payload.filter(isRecord);
  }

  if (!isRecord(payload)) {
    return [];
  }

  for (const key of ["contacts", "results", "data", "items", "messages"]) {
    const nested = payload[key];
    if (Array.isArray(nested)) {
      return nested.filter(isRecord);
    }
  }

  if (typeof payload.email === "string") {
    return [payload];
  }

  return [];
}

export function normalizeSomaContact(
  raw: Record<string, unknown>
): Omit<SomaContactSuggestion, "source"> | null {
  const emailCandidate = [raw.email, raw.primaryEmail, raw.emailAddress].find(
    (value) => typeof value === "string" && value.includes("@")
  );

  if (typeof emailCandidate !== "string") {
    return null;
  }

  const firstName =
    typeof raw.firstName === "string" ? raw.firstName.trim() : "";
  const lastName = typeof raw.lastName === "string" ? raw.lastName.trim() : "";
  const combinedName = [firstName, lastName].filter(Boolean).join(" ");

  const nameCandidate = [
    raw.name,
    raw.fullName,
    raw.displayName,
    combinedName || null,
  ].find((value) => typeof value === "string" && value.trim());

  const companyCandidate = [
    raw.company,
    raw.companyName,
    raw.organization,
    raw.accountName,
  ].find((value) => typeof value === "string" && value.trim());

  return {
    email: emailCandidate.trim(),
    name: typeof nameCandidate === "string" ? nameCandidate.trim() : null,
    company:
      typeof companyCandidate === "string" ? companyCandidate.trim() : null,
  };
}

function matchesQuery(
  query: string,
  contact: Omit<SomaContactSuggestion, "source">
): boolean {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) {
    return false;
  }

  if (contact.email.toLowerCase().includes(needle)) {
    return true;
  }

  return contact.name?.toLowerCase().includes(needle) ?? false;
}

function collectNestedContacts(
  payload: unknown,
  source: SomaContactSuggestion["source"]
): SomaContactSuggestion[] {
  const records = extractContactRecords(payload);
  const collected: SomaContactSuggestion[] = [];

  for (const record of records) {
    const normalized = normalizeSomaContact(record);
    if (normalized) {
      collected.push({ ...normalized, source });
      continue;
    }

    for (const key of ["from", "to", "participant", "contact", "sender"]) {
      const nested = record[key];
      if (Array.isArray(nested)) {
        for (const item of nested) {
          if (isRecord(item)) {
            const nestedContact = normalizeSomaContact(item);
            if (nestedContact) {
              collected.push({ ...nestedContact, source });
            }
          }
        }
      } else if (isRecord(nested)) {
        const nestedContact = normalizeSomaContact(nested);
        if (nestedContact) {
          collected.push({ ...nestedContact, source });
        }
      }
    }
  }

  return collected;
}

function rawToContextPerson(
  email: string,
  raw: Record<string, unknown> | null,
  source: ContextPerson["source"]
): ContextPerson {
  if (!raw) {
    return {
      email,
      name: null,
      role: null,
      company: null,
      somaContactId: null,
      somaCompanyId: null,
      source,
    };
  }

  const normalized = normalizeSomaContact(raw);
  const role =
    typeof raw.role === "string"
      ? raw.role
      : typeof raw.title === "string"
        ? raw.title
        : typeof raw.jobTitle === "string"
          ? raw.jobTitle
          : null;

  return {
    email: normalized?.email ?? email,
    name: normalized?.name ?? null,
    role,
    company: normalized?.company ?? null,
    somaContactId: typeof raw.id === "string" ? raw.id : null,
    somaCompanyId:
      typeof raw.companyId === "string"
        ? raw.companyId
        : typeof raw.somaCompanyId === "string"
          ? raw.somaCompanyId
          : null,
    source: raw.id ? "soma" : source,
  };
}

export async function fetchContactByEmail(
  email: string
): Promise<ContextPerson | null> {
  if (getHydrationConfig()) {
    const hydrated = await fetchHydrationContactByEmail(email);
    if (hydrated) {
      return hydrated;
    }
  }

  const payload = await searchSomaContactsByEmail(email);
  if (!payload) {
    return null;
  }
  const records = extractContactRecords(payload);
  const raw = records[0] ?? (isRecord(payload) ? payload : null);
  return rawToContextPerson(email, raw, "attendee");
}

export async function searchSomaContactsByEmail(
  email: string
): Promise<unknown | null> {
  const config = getSomaConfig();
  if (!config) {
    return null;
  }

  const encoded = encodeURIComponent(email);
  return somaFetch(
    `${config.baseUrl}/api/contacts/search?email=${encoded}`,
    config.apiKey
  );
}

function normalizeDeal(raw: Record<string, unknown>): ContextDeal | null {
  const name =
    (typeof raw.name === "string" && raw.name) ||
    (typeof raw.title === "string" && raw.title);
  if (!name) {
    return null;
  }
  return {
    id: typeof raw.id === "string" ? raw.id : null,
    name,
    stage:
      typeof raw.stage === "string"
        ? raw.stage
        : typeof raw.status === "string"
          ? raw.status
          : null,
    value:
      typeof raw.value === "string"
        ? raw.value
        : typeof raw.amount === "string"
          ? raw.amount
          : null,
  };
}

export async function searchSomaDeals(
  query: string,
  limit = 10
): Promise<ContextDeal[]> {
  if (getHydrationConfig()) {
    const deals = await searchHydrationDeals(query, limit);
    if (deals.length) {
      return deals;
    }
  }

  const config = getSomaConfig();
  if (!(config && query.trim())) {
    return [];
  }

  const encoded = encodeURIComponent(query.trim());
  const payload = await somaFetch(
    `${config.baseUrl}/api/deals/search?q=${encoded}`,
    config.apiKey
  );
  const records = extractContactRecords(payload);
  const deals: ContextDeal[] = [];
  for (const raw of records) {
    const deal = normalizeDeal(raw);
    if (deal) {
      deals.push(deal);
    }
    if (deals.length >= limit) {
      break;
    }
  }
  return deals;
}

function domainFromEmail(email: string): string | null {
  const at = email.indexOf("@");
  if (at < 0) {
    return null;
  }
  return email.slice(at + 1).toLowerCase() || null;
}

function normalizeCompany(
  raw: Record<string, unknown>,
  domainHint?: string | null
): ContextCompany | null {
  const name =
    (typeof raw.name === "string" && raw.name) ||
    (typeof raw.companyName === "string" && raw.companyName);
  if (!name) {
    return null;
  }

  const id = typeof raw.id === "string" ? raw.id : null;
  const base = somaBaseUrl();
  return {
    id,
    name,
    domain:
      (typeof raw.domain === "string" && raw.domain) ||
      (typeof raw.website === "string" && raw.website) ||
      domainHint ||
      null,
    somaUrl: id && base ? `${base}/companies/${id}` : null,
  };
}

export async function fetchCompanyById(
  companyId: string
): Promise<ContextCompany | null> {
  const config = getSomaConfig();
  if (!config) {
    return null;
  }

  const payload = await somaFetch(
    `${config.baseUrl}/api/companies/${encodeURIComponent(companyId)}`,
    config.apiKey
  );
  if (!isRecord(payload)) {
    return null;
  }
  return normalizeCompany(payload);
}

export async function searchCompaniesByDomain(
  domain: string
): Promise<ContextCompany[]> {
  if (getHydrationConfig()) {
    const found = await searchHydrationCompaniesByDomain(domain);
    if (found.length) {
      return found;
    }
  }

  const config = getSomaConfig();
  if (!(config && domain.trim())) {
    return [];
  }

  const encoded = encodeURIComponent(domain.trim());
  const payload = await somaFetch(
    `${config.baseUrl}/api/companies/search?domain=${encoded}`,
    config.apiKey
  );
  const records = extractContactRecords(payload);
  return records
    .map((r) => normalizeCompany(r, domain))
    .filter((c): c is ContextCompany => c != null);
}

function normalizeMessage(raw: Record<string, unknown>): ContextMessage | null {
  const subject =
    (typeof raw.subject === "string" && raw.subject) ||
    (typeof raw.title === "string" && raw.title) ||
    (typeof raw.snippet === "string" && raw.snippet.slice(0, 80));
  if (!subject) {
    return null;
  }

  const id = typeof raw.id === "string" ? raw.id : null;
  const threadId =
    typeof raw.threadId === "string"
      ? raw.threadId
      : typeof raw.conversationId === "string"
        ? raw.conversationId
        : id;

  const participants: string[] = [];
  for (const key of ["from", "to", "participants", "cc"]) {
    const val = raw[key];
    if (typeof val === "string" && val.includes("@")) {
      participants.push(val);
    } else if (Array.isArray(val)) {
      for (const item of val) {
        if (typeof item === "string" && item.includes("@")) {
          participants.push(item);
        } else if (isRecord(item) && typeof item.email === "string") {
          participants.push(item.email);
        }
      }
    }
  }

  const date =
    (typeof raw.date === "string" && raw.date) ||
    (typeof raw.sentAt === "string" && raw.sentAt) ||
    (typeof raw.createdAt === "string" && raw.createdAt) ||
    null;

  const base = somaBaseUrl();
  return {
    id,
    subject,
    date,
    participants,
    somaUrl: id && base ? `${base}/messages/${id}` : null,
    emailDeepLink: threadId
      ? `/email?threadId=${encodeURIComponent(threadId)}`
      : null,
  };
}

export async function searchSomaMessages(
  query: string,
  limit = 12
): Promise<ContextMessage[]> {
  if (getHydrationConfig()) {
    const messages = await searchHydrationMessages(query, limit);
    if (messages.length) {
      return messages;
    }
  }

  const config = getSomaConfig();
  if (!config || query.trim().length < 2) {
    return [];
  }

  const encoded = encodeURIComponent(query.trim());
  const attempts = [
    `${config.baseUrl}/api/messages/search?q=${encoded}`,
    `${config.baseUrl}/api/conversations/search?q=${encoded}`,
  ];

  const seen = new Set<string>();
  const messages: ContextMessage[] = [];

  for (const url of attempts) {
    const payload = await somaFetch(url, config.apiKey);
    for (const raw of extractContactRecords(payload)) {
      const msg = normalizeMessage(raw);
      if (!msg) {
        continue;
      }
      const key = msg.id ?? msg.subject;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      messages.push(msg);
      if (messages.length >= limit) {
        return messages;
      }
    }
  }

  return messages;
}

export async function resolveCompaniesForPeople(
  people: ContextPerson[]
): Promise<ContextCompany[]> {
  const config = getSomaConfig();
  if (!config) {
    return [];
  }

  const byId = new Map<string, ContextCompany>();
  const domains = new Set<string>();

  for (const person of people) {
    if (person.somaCompanyId && !byId.has(person.somaCompanyId)) {
      const company = await fetchCompanyById(person.somaCompanyId);
      if (company) {
        byId.set(person.somaCompanyId, company);
      }
    }
    const domain = domainFromEmail(person.email);
    if (domain) {
      domains.add(domain);
    }
  }

  for (const domain of domains) {
    const found = await searchCompaniesByDomain(domain);
    for (const company of found) {
      const key = company.id ?? company.name;
      if (!byId.has(key)) {
        byId.set(key, company);
      }
    }
  }

  return [...byId.values()];
}

export async function searchSomaContacts(
  query: string,
  limit = 8
): Promise<SomaContactSuggestion[]> {
  if (getHydrationConfig()) {
    const hydrated = await searchHydrationContacts(query, limit);
    if (hydrated.length) {
      return hydrated;
    }
  }

  const config = getSomaConfig();
  if (!config) {
    return [];
  }

  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return [];
  }

  const encoded = encodeURIComponent(trimmed);
  const attempts: Array<{
    source: SomaContactSuggestion["source"];
    url: string;
  }> = [];

  if (trimmed.includes("@")) {
    attempts.push({
      source: "soma",
      url: `${config.baseUrl}/api/contacts/search?email=${encoded}`,
    });
  }

  attempts.push(
    {
      source: "soma",
      url: `${config.baseUrl}/api/contacts/search?q=${encoded}`,
    },
    {
      source: "soma",
      url: `${config.baseUrl}/api/contacts/search?query=${encoded}`,
    },
    {
      source: "messages",
      url: `${config.baseUrl}/api/messages/search?q=${encoded}`,
    },
    {
      source: "messages",
      url: `${config.baseUrl}/api/conversations/search?q=${encoded}`,
    }
  );

  const responses = await Promise.all(
    attempts.map(async ({ url, source }) => ({
      source,
      payload: await somaFetch(url, config.apiKey),
    }))
  );

  const seen = new Set<string>();
  const results: SomaContactSuggestion[] = [];

  for (const { payload, source } of responses) {
    const contacts = collectNestedContacts(payload, source);
    for (const contact of contacts) {
      if (!matchesQuery(trimmed, contact)) {
        continue;
      }

      const key = contact.email.toLowerCase();
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      results.push(contact);
      if (results.length >= limit) {
        return results;
      }
    }
  }

  return results;
}

function extractEmailRecords(payload: unknown): Record<string, unknown>[] {
  if (!payload) {
    return [];
  }
  if (Array.isArray(payload)) {
    return payload.filter(isRecord);
  }
  if (!isRecord(payload)) {
    return [];
  }

  for (const key of [
    "conversations",
    "messages",
    "threads",
    "results",
    "data",
    "items",
  ]) {
    const nested = payload[key];
    if (Array.isArray(nested)) {
      return nested.filter(isRecord);
    }
  }
  return [];
}

function parseParticipantList(raw: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const key of ["from", "to", "participants", "cc", "bcc"]) {
    const val = raw[key];
    if (typeof val === "string" && val.includes("@")) {
      out.push(val);
    } else if (Array.isArray(val)) {
      for (const item of val) {
        if (typeof item === "string" && item.includes("@")) {
          out.push(item);
        } else if (isRecord(item) && typeof item.email === "string") {
          out.push(item.email);
        }
      }
    } else if (isRecord(val) && typeof val.email === "string") {
      out.push(val.email);
    }
  }
  return [...new Set(out.map((e) => e.trim()).filter(Boolean))];
}

function threadIdFromRaw(raw: Record<string, unknown>): string | null {
  if (typeof raw.threadId === "string" && raw.threadId) {
    return raw.threadId;
  }
  if (typeof raw.conversationId === "string" && raw.conversationId) {
    return raw.conversationId;
  }
  if (typeof raw.id === "string" && raw.id) {
    return raw.id;
  }
  return null;
}

function normalizeEmailThread(
  raw: Record<string, unknown>
): EmailThreadSummary | null {
  const id = threadIdFromRaw(raw);
  if (!id) {
    return null;
  }

  const subject =
    (typeof raw.subject === "string" && raw.subject) ||
    (typeof raw.title === "string" && raw.title) ||
    "(No subject)";

  const snippet =
    (typeof raw.snippet === "string" && raw.snippet) ||
    (typeof raw.preview === "string" && raw.preview) ||
    (typeof raw.body === "string" && raw.body.slice(0, 120)) ||
    null;

  const date =
    (typeof raw.date === "string" && raw.date) ||
    (typeof raw.lastMessageAt === "string" && raw.lastMessageAt) ||
    (typeof raw.updatedAt === "string" && raw.updatedAt) ||
    (typeof raw.sentAt === "string" && raw.sentAt) ||
    (typeof raw.createdAt === "string" && raw.createdAt) ||
    null;

  const messageCount =
    typeof raw.messageCount === "number"
      ? raw.messageCount
      : typeof raw.count === "number"
        ? raw.count
        : 1;

  return {
    id,
    subject,
    snippet,
    date,
    participants: parseParticipantList(raw),
    unread: Boolean(raw.unread ?? raw.isUnread),
    messageCount,
  };
}

function normalizeEmailMessage(
  raw: Record<string, unknown>,
  fallbackThreadId: string
): EmailMessage | null {
  const id =
    (typeof raw.id === "string" && raw.id) ||
    (typeof raw.messageId === "string" && raw.messageId);
  if (!id) {
    return null;
  }

  const threadId = threadIdFromRaw(raw) ?? fallbackThreadId;
  const fromVal = raw.from;
  let from = "";
  if (typeof fromVal === "string") {
    from = fromVal;
  } else if (isRecord(fromVal) && typeof fromVal.email === "string") {
    from = fromVal.email;
  }

  const to: string[] = [];
  const cc: string[] = [];
  const pushEmails = (key: "to" | "cc", target: string[]) => {
    const val = raw[key];
    if (typeof val === "string" && val.includes("@")) {
      target.push(val);
    } else if (Array.isArray(val)) {
      for (const item of val) {
        if (typeof item === "string" && item.includes("@")) {
          target.push(item);
        } else if (isRecord(item) && typeof item.email === "string") {
          target.push(item.email);
        }
      }
    }
  };
  pushEmails("to", to);
  pushEmails("cc", cc);

  const subject =
    (typeof raw.subject === "string" && raw.subject) || "(No subject)";
  const bodyHtml =
    (typeof raw.bodyHtml === "string" && raw.bodyHtml) ||
    (typeof raw.html === "string" && raw.html) ||
    null;
  const body =
    (typeof raw.body === "string" && raw.body) ||
    (typeof raw.text === "string" && raw.text) ||
    (typeof raw.snippet === "string" && raw.snippet) ||
    "";

  const date =
    (typeof raw.date === "string" && raw.date) ||
    (typeof raw.sentAt === "string" && raw.sentAt) ||
    (typeof raw.createdAt === "string" && raw.createdAt) ||
    null;

  return {
    id,
    threadId,
    from,
    to,
    cc,
    subject,
    body,
    bodyHtml,
    date,
  };
}

export async function listSomaEmailThreads(input?: {
  q?: string;
  limit?: number;
}): Promise<{ threads: EmailThreadSummary[]; error?: string }> {
  if (getHydrationConfig()) {
    const hydrated = await listHydrationEmailThreads(input);
    if (hydrated.threads.length > 0) {
      return hydrated;
    }
  }

  const config = getSomaConfig();
  if (!config) {
    if (getHydrationConfig()) {
      return { threads: [], error: "No email threads in hydration; run POST /v1/crm/sync/soma-mail" };
    }
    return { threads: [], error: "Soma not configured" };
  }

  const limit = input?.limit ?? 40;
  const q = input?.q?.trim();
  const urls: string[] = [];

  if (q && q.length >= 2) {
    const encoded = encodeURIComponent(q);
    urls.push(
      `${config.baseUrl}/api/conversations/search?q=${encoded}`,
      `${config.baseUrl}/api/messages/search?q=${encoded}`
    );
  } else {
    urls.push(
      `${config.baseUrl}/api/conversations?limit=${limit}`,
      `${config.baseUrl}/api/conversations/recent?limit=${limit}`,
      `${config.baseUrl}/api/messages?limit=${limit}`,
      `${config.baseUrl}/api/messages/recent?limit=${limit}`
    );
  }

  const byId = new Map<string, EmailThreadSummary>();

  for (const url of urls) {
    const payload = await somaFetch(url, config.apiKey);
    for (const raw of extractEmailRecords(payload)) {
      const thread = normalizeEmailThread(raw);
      if (!thread) {
        continue;
      }
      const existing = byId.get(thread.id);
      if (!existing) {
        byId.set(thread.id, thread);
      } else if (
        thread.date &&
        (!existing.date || new Date(thread.date) > new Date(existing.date))
      ) {
        byId.set(thread.id, { ...existing, ...thread });
      }
      if (byId.size >= limit) {
        break;
      }
    }
    if (byId.size >= limit) {
      break;
    }
  }

  const threads = [...byId.values()].sort((a, b) => {
    const at = a.date ? new Date(a.date).getTime() : 0;
    const bt = b.date ? new Date(b.date).getTime() : 0;
    return bt - at;
  });

  if (threads.length === 0 && !q) {
    return {
      threads: [],
      error: "No conversations returned from Soma",
    };
  }

  return { threads };
}

export async function getSomaEmailThread(
  threadId: string
): Promise<{ detail: EmailThreadDetail | null; error?: string }> {
  if (getHydrationConfig()) {
    const hydrated = await getHydrationEmailThread(threadId);
    if (hydrated.detail) {
      return hydrated;
    }
  }

  const config = getSomaConfig();
  if (!config) {
    if (getHydrationConfig()) {
      return { detail: null, error: "Thread not in hydration; sync soma-mail or configure Soma" };
    }
    return { detail: null, error: "Soma not configured" };
  }

  const encoded = encodeURIComponent(threadId);
  const urls = [
    `${config.baseUrl}/api/conversations/${encoded}`,
    `${config.baseUrl}/api/conversations/${encoded}/messages`,
    `${config.baseUrl}/api/messages/${encoded}`,
    `${config.baseUrl}/api/threads/${encoded}`,
  ];

  let thread: EmailThreadSummary | null = null;
  const messages: EmailMessage[] = [];
  const seenMsg = new Set<string>();

  for (const url of urls) {
    const payload = await somaFetch(url, config.apiKey);
    if (!payload) {
      continue;
    }

    if (isRecord(payload) && !Array.isArray(payload)) {
      const maybeThread = normalizeEmailThread(payload);
      if (maybeThread) {
        thread = maybeThread;
      }

      const nested = extractEmailRecords(payload);
      for (const raw of nested) {
        const msg = normalizeEmailMessage(raw, threadId);
        if (!msg || seenMsg.has(msg.id)) {
          continue;
        }
        seenMsg.add(msg.id);
        messages.push(msg);
      }

      const single = normalizeEmailMessage(payload, threadId);
      if (single && !seenMsg.has(single.id)) {
        seenMsg.add(single.id);
        messages.push(single);
      }
    } else {
      for (const raw of extractEmailRecords(payload)) {
        const maybeThread = normalizeEmailThread(raw);
        if (maybeThread && maybeThread.id === threadId) {
          thread = maybeThread;
        }
        const msg = normalizeEmailMessage(raw, threadId);
        if (!msg || seenMsg.has(msg.id)) {
          continue;
        }
        seenMsg.add(msg.id);
        messages.push(msg);
      }
    }
  }

  if (!thread && messages.length > 0) {
    const first = messages[0];
    thread = {
      id: threadId,
      subject: first.subject,
      snippet: first.body.slice(0, 120) || null,
      date: first.date,
      participants: [first.from, ...first.to, ...first.cc].filter(Boolean),
      unread: false,
      messageCount: messages.length,
    };
  }

  if (!thread) {
    const search = await listSomaEmailThreads({ q: threadId, limit: 5 });
    thread =
      search.threads.find((t) => t.id === threadId) ??
      search.threads[0] ??
      null;
  }

  if (!thread) {
    return { detail: null, error: "Thread not found" };
  }

  messages.sort((a, b) => {
    const at = a.date ? new Date(a.date).getTime() : 0;
    const bt = b.date ? new Date(b.date).getTime() : 0;
    return at - bt;
  });

  return {
    detail: {
      thread: {
        ...thread,
        messageCount: messages.length || thread.messageCount,
      },
      messages,
    },
  };
}
