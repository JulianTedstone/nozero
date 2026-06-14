import "server-only";

import type {
  EmailMessage,
  EmailThreadDetail,
  EmailThreadListItem,
  EmailThreadSummary,
} from "@/types/email";
import type {
  ContextCompany,
  ContextDeal,
  ContextMessage,
  ContextPerson,
} from "@/types/meeting-context";

const TIMEOUT_MS = 4000;

export type HydrationContactSuggestion = {
  email: string;
  name: string | null;
  company: string | null;
  source: "soma" | "messages";
};

type HydrationRow = Record<string, unknown>;

export function getHydrationConfig() {
  const baseUrl = process.env.HYDRATION_API_URL?.replace(/\/$/, "");
  if (!baseUrl) {
    return null;
  }
  return {
    baseUrl,
    tenantSlug: process.env.HYDRATION_TENANT_SLUG ?? "npt",
  };
}

export function hydrationBaseUrl(): string {
  return process.env.HYDRATION_API_URL?.replace(/\/$/, "") ?? "";
}

async function hydrationFetch(path: string): Promise<unknown | null> {
  const config = getHydrationConfig();
  if (!config) {
    return null;
  }

  try {
    const response = await fetch(`${config.baseUrl}/v1/crm${path}`, {
      headers: { "X-Tenant-Slug": config.tenantSlug },
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

function rows(payload: unknown): HydrationRow[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const data = (payload as { data?: unknown }).data;
  return Array.isArray(data) ? (data as HydrationRow[]) : [];
}

function personFromRow(raw: HydrationRow, emailHint?: string): ContextPerson | null {
  const email =
    (typeof raw.email === "string" && raw.email) || emailHint;
  if (!email?.includes("@")) {
    return null;
  }
  return {
    email,
    name: typeof raw.name === "string" ? raw.name : null,
    role: null,
    company:
      typeof raw.company === "string"
        ? raw.company
        : typeof (raw.metadata as HydrationRow)?.company === "string"
          ? ((raw.metadata as HydrationRow).company as string)
          : null,
    somaContactId: typeof raw.id === "string" ? raw.id : null,
    somaCompanyId: null,
    source: "soma",
  };
}

export async function fetchHydrationContactByEmail(
  email: string,
): Promise<ContextPerson | null> {
  const all = rows(await hydrationFetch("/people"));
  const needle = email.trim().toLowerCase();
  const match = all.find(
    (row) =>
      typeof row.email === "string" &&
      row.email.trim().toLowerCase() === needle,
  );
  return match ? personFromRow(match, email) : null;
}

export async function searchHydrationContacts(
  query: string,
  limit = 12,
): Promise<HydrationContactSuggestion[]> {
  const trimmed = query.trim().toLowerCase();
  if (trimmed.length < 2) {
    return [];
  }

  const people = rows(await hydrationFetch("/people"));
  const companies = rows(await hydrationFetch("/companies"));
  const companyById = new Map<string, string>();
  for (const c of companies) {
    if (typeof c.id === "string" && typeof c.name === "string") {
      companyById.set(c.id, c.name);
    }
  }

  const results: HydrationContactSuggestion[] = [];
  for (const row of people) {
    const email = typeof row.email === "string" ? row.email : "";
    const name = typeof row.name === "string" ? row.name : null;
    const companyId =
      typeof (row.metadata as HydrationRow)?.company_id === "string"
        ? ((row.metadata as HydrationRow).company_id as string)
        : null;
    const company = companyId ? (companyById.get(companyId) ?? null) : null;

    const hay = `${email} ${name ?? ""} ${company ?? ""}`.toLowerCase();
    if (!hay.includes(trimmed)) {
      continue;
    }
    if (!email.includes("@")) {
      continue;
    }
    results.push({ email, name, company, source: "soma" });
    if (results.length >= limit) {
      break;
    }
  }
  return results;
}

export async function searchHydrationDeals(
  query: string,
  limit = 10,
): Promise<ContextDeal[]> {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return [];
  }

  const deals = rows(await hydrationFetch("/deals"));
  const out: ContextDeal[] = [];
  for (const raw of deals) {
    const name = typeof raw.name === "string" ? raw.name : null;
    if (!name || !name.toLowerCase().includes(trimmed)) {
      continue;
    }
    out.push({
      id: typeof raw.id === "string" ? raw.id : null,
      name,
      stage:
        typeof raw.stage === "string"
          ? raw.stage
          : typeof (raw.metadata as HydrationRow)?.stage === "string"
            ? ((raw.metadata as HydrationRow).stage as string)
            : null,
      value:
        typeof raw.value === "string"
          ? raw.value
          : typeof (raw.metadata as HydrationRow)?.value === "string"
            ? ((raw.metadata as HydrationRow).value as string)
            : null,
    });
    if (out.length >= limit) {
      break;
    }
  }
  return out;
}

export async function searchHydrationMessages(
  query: string,
  limit = 8,
): Promise<ContextMessage[]> {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return [];
  }

  const messages = rows(await hydrationFetch("/messages"));
  const out: ContextMessage[] = [];
  for (const raw of messages) {
    const subject =
      typeof raw.subject === "string"
        ? raw.subject
        : typeof (raw.metadata as HydrationRow)?.subject === "string"
          ? ((raw.metadata as HydrationRow).subject as string)
          : "";
    const body =
      typeof raw.body === "string"
        ? raw.body
        : typeof raw.content === "string"
          ? raw.content
          : "";
    const hay = `${subject} ${body}`.toLowerCase();
    if (!hay.includes(trimmed)) {
      continue;
    }
    out.push({
      id: typeof raw.id === "string" ? raw.id : null,
      subject: subject || "(no subject)",
      date:
        typeof raw.sent_at === "string"
          ? raw.sent_at
          : typeof raw.created_at === "string"
            ? raw.created_at
            : null,
      participants: [],
      somaUrl: null,
      emailDeepLink: null,
    });
    if (out.length >= limit) {
      break;
    }
  }
  return out;
}

export async function searchHydrationCompaniesByDomain(
  domain: string,
): Promise<ContextCompany[]> {
  const needle = domain.trim().toLowerCase();
  if (!needle) {
    return [];
  }

  const companies = rows(await hydrationFetch("/companies"));
  const out: ContextCompany[] = [];
  for (const raw of companies) {
    const name = typeof raw.name === "string" ? raw.name : null;
    const rawDomain =
      typeof raw.domain === "string"
        ? raw.domain
        : typeof (raw.metadata as HydrationRow)?.domain === "string"
          ? ((raw.metadata as HydrationRow).domain as string)
          : null;
    if (!name) {
      continue;
    }
    if (rawDomain?.toLowerCase() !== needle && !name.toLowerCase().includes(needle)) {
      continue;
    }
    out.push({
      id: typeof raw.id === "string" ? raw.id : null,
      name,
      domain: rawDomain ?? needle,
      somaUrl: hydrationBaseUrl()
        ? `${hydrationBaseUrl()}/v1/crm/companies/${String(raw.id)}`
        : null,
    });
  }
  return out;
}

function threadSummaryFromRow(raw: HydrationRow): EmailThreadSummary | null {
  const id =
    (typeof raw.external_thread_id === "string" && raw.external_thread_id) ||
    (typeof raw.id === "string" && raw.id);
  if (!id) return null;

  const participants = Array.isArray(raw.participants)
    ? (raw.participants as unknown[]).filter((p): p is string => typeof p === "string")
    : [];

  return {
    id,
    subject: typeof raw.subject === "string" ? raw.subject : "(No subject)",
    snippet: typeof raw.snippet === "string" ? raw.snippet : null,
    date:
      typeof raw.last_message_at === "string"
        ? raw.last_message_at
        : typeof raw.updated_at === "string"
          ? raw.updated_at
          : null,
    participants,
    unread: Boolean(raw.unread),
    messageCount: typeof raw.message_count === "number" ? raw.message_count : 1,
  };
}

function threadListItemFromRow(raw: HydrationRow): EmailThreadListItem | null {
  const summary = threadSummaryFromRow(raw);
  if (!summary) return null;
  const sender = summary.participants[0] ?? "";
  return {
    ...summary,
    sender,
    aiSummary: null,
    tracking: false,
    archived: false,
    accountEmail:
      typeof raw.account_email === "string" ? raw.account_email : "",
    streams: [],
    threadIntent: null,
  };
}

function messageFromRow(raw: HydrationRow, fallbackThreadId: string): EmailMessage | null {
  const id =
    (typeof raw.external_message_id === "string" && raw.external_message_id) ||
    (typeof raw.id === "string" && raw.id);
  if (!id) return null;

  const to = Array.isArray(raw.to_emails)
    ? (raw.to_emails as unknown[]).filter((p): p is string => typeof p === "string")
    : [];
  const cc = Array.isArray(raw.cc_emails)
    ? (raw.cc_emails as unknown[]).filter((p): p is string => typeof p === "string")
    : [];

  return {
    id,
    threadId:
      typeof raw.thread_external_id === "string"
        ? raw.thread_external_id
        : fallbackThreadId,
    from: typeof raw.from_email === "string" ? raw.from_email : "",
    to,
    cc,
    subject: typeof raw.subject === "string" ? raw.subject : "(No subject)",
    body: typeof raw.body === "string" ? raw.body : "",
    bodyHtml: typeof raw.body_html === "string" ? raw.body_html : null,
    date:
      typeof raw.sent_at === "string"
        ? raw.sent_at
        : typeof raw.created_at === "string"
          ? raw.created_at
          : null,
  };
}

export async function listHydrationEmailThreads(input?: {
  q?: string;
  limit?: number;
}): Promise<{ threads: EmailThreadSummary[]; error?: string }> {
  const config = getHydrationConfig();
  if (!config) {
    return { threads: [], error: "Hydration not configured" };
  }

  const params = new URLSearchParams();
  if (input?.q) params.set("q", input.q);
  if (input?.limit) params.set("limit", String(input.limit));
  const qs = params.toString();
  const payload = await hydrationFetch(`/threads${qs ? `?${qs}` : ""}`);
  const threads = rows(payload)
    .map(threadSummaryFromRow)
    .filter((t): t is EmailThreadSummary => t !== null);

  return { threads };
}

export async function getHydrationEmailThread(
  threadId: string,
): Promise<{ detail: EmailThreadDetail | null; error?: string }> {
  const config = getHydrationConfig();
  if (!config) {
    return { detail: null, error: "Hydration not configured" };
  }

  const payload = await hydrationFetch(`/threads/${encodeURIComponent(threadId)}`);
  if (!payload || typeof payload !== "object") {
    return { detail: null, error: "Thread not found in hydration" };
  }

  const data = (payload as { data?: HydrationRow & { messages?: HydrationRow[] } }).data;
  if (!data || typeof data !== "object") {
    return { detail: null, error: "Thread not found in hydration" };
  }

  const threadRow = data as HydrationRow;
  const thread = threadListItemFromRow(threadRow);
  if (!thread) {
    return { detail: null, error: "Invalid thread payload from hydration" };
  }

  const externalId =
    typeof threadRow.external_thread_id === "string"
      ? threadRow.external_thread_id
      : threadId;
  const nested = Array.isArray((data as { messages?: unknown }).messages)
    ? (data as { messages: HydrationRow[] }).messages
    : [];

  const messages = nested
    .map((row) => messageFromRow(row, externalId))
    .filter((m): m is EmailMessage => m !== null);

  return { detail: { thread, messages } };
}
