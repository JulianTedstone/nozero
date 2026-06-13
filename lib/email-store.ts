import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  displaySender,
  extractSenderEmail,
  stripEmailBody,
} from "@/lib/email-body";
import {
  inferThreadIntent,
  summarizeMessage,
  summarizeThread,
} from "@/lib/email-enrichment";
import {
  enabledAccountEmails,
  inferAccountEmail,
  listEmailAccountViews,
} from "@/lib/email-preferences";
import {
  getSomaEmailThread,
  listSomaEmailThreads,
} from "@/lib/soma-client";
import type {
  EmailMessage,
  EmailThreadDetail,
  EmailThreadListItem,
  EmailThreadSummary,
  MessageAiSummary,
} from "@/types/email";

const PAGE_SIZE = 20;

type DbThreadRow = {
  id: string;
  external_id: string;
  account_email: string;
  subject: string;
  sender_email: string | null;
  ai_summary: string | null;
  thread_intent: string | null;
  participants: unknown;
  is_unread: boolean;
  is_archived: boolean;
  is_tracking: boolean;
  streams: unknown;
  message_count: number;
  last_message_at: string | null;
};

type DbMessageRow = {
  id: string;
  external_id: string;
  thread_external_id: string;
  account_email: string | null;
  from_email: string | null;
  to_emails: unknown;
  cc_emails: unknown;
  subject: string | null;
  body_plain: string;
  body_original: string | null;
  ai_summary: unknown;
  sent_at: string | null;
};

function parseStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === "string");
}

function rowToListItem(row: DbThreadRow): EmailThreadListItem {
  return {
    id: row.external_id,
    subject: row.subject,
    sender: row.sender_email ?? "Unknown",
    aiSummary: row.ai_summary,
    snippet: row.ai_summary,
    date: row.last_message_at,
    participants: parseStringArray(row.participants),
    unread: row.is_unread,
    tracking: row.is_tracking,
    archived: row.is_archived,
    messageCount: row.message_count,
    accountEmail: row.account_email,
    streams: parseStringArray(row.streams),
  };
}

function rowToMessage(row: DbMessageRow): EmailMessage {
  const ai =
    row.ai_summary && typeof row.ai_summary === "object"
      ? (row.ai_summary as MessageAiSummary)
      : null;

  return {
    id: row.external_id,
    threadId: row.thread_external_id,
    from: row.from_email ?? "",
    to: parseStringArray(row.to_emails),
    cc: parseStringArray(row.cc_emails),
    subject: row.subject ?? "(No subject)",
    body: row.body_plain,
    bodyHtml: null,
    bodyOriginal: row.body_original,
    date: row.sent_at,
    aiSummary: ai,
    isMine: false,
  };
}

async function upsertThreadFromSoma(
  userId: string,
  thread: EmailThreadSummary,
  accountEmail: string,
): Promise<void> {
  const admin = createAdminClient();
  const sender =
    thread.participants.find((p) => p.toLowerCase() !== accountEmail) ??
    thread.participants[0] ??
    null;

  const { data: existing } = await admin
    .schema("nozero")
    .from("email_threads")
    .select("id, ai_summary")
    .eq("user_id", userId)
    .eq("external_id", thread.id)
    .eq("account_email", accountEmail)
    .maybeSingle();

  let aiSummary = existing?.ai_summary as string | null | undefined;
  if (!aiSummary) {
    aiSummary = await summarizeThread({
      subject: thread.subject,
      participants: thread.participants,
      snippet: thread.snippet,
    });
  }

  await admin.schema("nozero").from("email_threads").upsert(
    {
      user_id: userId,
      external_id: thread.id,
      account_email: accountEmail,
      subject: thread.subject,
      sender_email: sender ? extractSenderEmail(sender) : null,
      ai_summary: aiSummary,
      participants: thread.participants,
      is_unread: thread.unread,
      message_count: thread.messageCount,
      last_message_at: thread.date,
    },
    { onConflict: "user_id,external_id,account_email" },
  );
}

async function ingestThreadMessages(
  userId: string,
  threadId: string,
  accountEmail: string,
  userEmails: string[],
): Promise<EmailThreadDetail | null> {
  const { detail } = await getSomaEmailThread(threadId);
  if (!detail) {
    return null;
  }

  const admin = createAdminClient();
  const priorBodies: string[] = [];

  for (const msg of detail.messages) {
    const { data: existing } = await admin
      .schema("nozero")
      .from("email_messages")
      .select("id, ai_summary")
      .eq("user_id", userId)
      .eq("external_id", msg.id)
      .maybeSingle();

    const { plain, original } = stripEmailBody({
      body: msg.body,
      bodyHtml: msg.bodyHtml,
    });

    let aiSummary: MessageAiSummary | null =
      existing?.ai_summary && typeof existing.ai_summary === "object"
        ? (existing.ai_summary as MessageAiSummary)
        : null;

    if (!aiSummary && plain.length > 0) {
      aiSummary = await summarizeMessage({
        subject: msg.subject,
        from: msg.from,
        bodyPlain: plain,
        priorMessages: priorBodies,
      });
    }
    if (plain) {
      priorBodies.push(plain.slice(0, 500));
    }

    await admin.schema("nozero").from("email_messages").upsert(
      {
        user_id: userId,
        external_id: msg.id,
        thread_external_id: threadId,
        account_email: accountEmail,
        from_email: extractSenderEmail(msg.from) || msg.from,
        to_emails: msg.to,
        cc_emails: msg.cc,
        subject: msg.subject,
        body_plain: plain,
        body_original: original || null,
        ai_summary: aiSummary,
        sent_at: msg.date,
      },
      { onConflict: "user_id,external_id" },
    );
  }

  const summaries = priorBodies.slice(-5);
  const threadIntent = await inferThreadIntent({
    subject: detail.thread.subject,
    participants: detail.thread.participants,
    summaries,
  });

  const sender =
    detail.thread.participants.find(
      (p) => !userEmails.includes(p.toLowerCase()),
    ) ?? detail.thread.participants[0];

  await admin.schema("nozero").from("email_threads").upsert(
    {
      user_id: userId,
      external_id: threadId,
      account_email: accountEmail,
      subject: detail.thread.subject,
      sender_email: sender ? extractSenderEmail(sender) : null,
      participants: detail.thread.participants,
      message_count: detail.messages.length,
      last_message_at: detail.messages.at(-1)?.date ?? detail.thread.date,
      thread_intent: threadIntent,
      is_unread: false,
    },
    { onConflict: "user_id,external_id,account_email" },
  );

  return loadThreadFromDb(userId, threadId, accountEmail, userEmails);
}

async function loadThreadFromDb(
  userId: string,
  threadId: string,
  accountEmail: string,
  userEmails: string[],
): Promise<EmailThreadDetail | null> {
  const admin = createAdminClient();
  const { data: threadRow } = await admin
    .schema("nozero")
    .from("email_threads")
    .select("*")
    .eq("user_id", userId)
    .eq("external_id", threadId)
    .eq("account_email", accountEmail)
    .maybeSingle();

  if (!threadRow) return null;

  const { data: messageRows } = await admin
    .schema("nozero")
    .from("email_messages")
    .select("*")
    .eq("user_id", userId)
    .eq("thread_external_id", threadId)
    .order("sent_at", { ascending: true });

  const userSet = new Set(userEmails.map((e) => e.toLowerCase()));
  const messages = (messageRows ?? []).map((row) => {
    const msg = rowToMessage(row as DbMessageRow);
    const fromLower = extractSenderEmail(msg.from);
    msg.isMine = userSet.has(fromLower);
    return msg;
  });

  const row = threadRow as DbThreadRow;
  return {
    thread: {
      ...rowToListItem(row),
      threadIntent: row.thread_intent,
    },
    messages,
  };
}

export async function syncSomaThreads(userId: string, limit = 40): Promise<void> {
  const accounts = await listEmailAccountViews(userId);
  const enabled = enabledAccountEmails(accounts);
  if (enabled.length === 0) return;

  const { threads } = await listSomaEmailThreads({ limit });
  for (const thread of threads) {
    const accountEmail = inferAccountEmail(thread.participants, enabled);
    if (!enabled.includes(accountEmail)) continue;
    await upsertThreadFromSoma(userId, thread, accountEmail);
  }
}

export async function listStoredThreads(input: {
  userId: string;
  filter: "unread" | "tracking" | "all";
  q?: string;
  stream?: string;
  cursor?: string;
  limit?: number;
  sync?: boolean;
}): Promise<{
  threads: EmailThreadListItem[];
  nextCursor: string | null;
  error?: string;
}> {
  const limit = input.limit ?? PAGE_SIZE;
  const accounts = await listEmailAccountViews(input.userId);
  const enabled = enabledAccountEmails(accounts);

  if (enabled.length === 0) {
    return { threads: [], nextCursor: null, error: "No email accounts enabled" };
  }

  if (input.sync !== false) {
    await syncSomaThreads(input.userId, 60);
  }

  const admin = createAdminClient();
  let query = admin
    .schema("nozero")
    .from("email_threads")
    .select("*")
    .eq("user_id", input.userId)
    .eq("is_archived", false)
    .in("account_email", enabled)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(limit + 1);

  if (input.filter === "unread") {
    query = query.eq("is_unread", true);
  } else if (input.filter === "tracking") {
    query = query.eq("is_tracking", true);
  }

  if (input.stream?.trim()) {
    query = query.contains("streams", [input.stream.trim()]);
  }

  const q = input.q?.trim();
  if (q && q.length >= 2) {
    query = query.or(
      `subject.ilike.%${q}%,sender_email.ilike.%${q}%,ai_summary.ilike.%${q}%`,
    );
  }

  if (input.cursor) {
    query = query.lt("last_message_at", input.cursor);
  }

  const { data, error } = await query;
  if (error) {
    return {
      threads: [],
      nextCursor: null,
      error: error.message,
    };
  }

  const rows = (data ?? []) as DbThreadRow[];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor =
    hasMore && page.at(-1)?.last_message_at
      ? page.at(-1)!.last_message_at
      : null;

  return {
    threads: page.map(rowToListItem),
    nextCursor,
  };
}

export async function getStoredThread(
  userId: string,
  threadId: string,
  accountEmail?: string,
): Promise<{ detail: EmailThreadDetail | null; error?: string }> {
  const accounts = await listEmailAccountViews(userId);
  const enabled = enabledAccountEmails(accounts);
  if (enabled.length === 0) {
    return { detail: null, error: "No email accounts enabled" };
  }

  const admin = createAdminClient();
  let resolvedAccount = accountEmail?.toLowerCase();

  if (!resolvedAccount) {
    const { data: row } = await admin
      .schema("nozero")
      .from("email_threads")
      .select("account_email")
      .eq("user_id", userId)
      .eq("external_id", threadId)
      .maybeSingle();
    resolvedAccount = row?.account_email ?? enabled[0];
  }

  if (!enabled.includes(resolvedAccount)) {
    return { detail: null, error: "Account not enabled" };
  }

  let detail = await loadThreadFromDb(
    userId,
    threadId,
    resolvedAccount,
    enabled,
  );

  if (!detail || detail.messages.length === 0) {
    detail = await ingestThreadMessages(
      userId,
      threadId,
      resolvedAccount,
      enabled,
    );
  }

  if (!detail) {
    return { detail: null, error: "Thread not found" };
  }

  await admin
    .schema("nozero")
    .from("email_threads")
    .update({ is_unread: false })
    .eq("user_id", userId)
    .eq("external_id", threadId)
    .eq("account_email", resolvedAccount);

  return { detail: { ...detail, thread: { ...detail.thread, unread: false } } };
}

export async function patchStoredThread(
  userId: string,
  threadId: string,
  patch: {
    accountEmail?: string;
    isUnread?: boolean;
    isArchived?: boolean;
    isTracking?: boolean;
    streams?: string[];
    threadIntent?: string;
  },
): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient();
  const update: Record<string, unknown> = {};
  if (patch.isUnread != null) update.is_unread = patch.isUnread;
  if (patch.isArchived != null) update.is_archived = patch.isArchived;
  if (patch.isTracking != null) update.is_tracking = patch.isTracking;
  if (patch.streams != null) update.streams = patch.streams;
  if (patch.threadIntent != null) update.thread_intent = patch.threadIntent;

  let query = admin
    .schema("nozero")
    .from("email_threads")
    .update(update)
    .eq("user_id", userId)
    .eq("external_id", threadId);

  if (patch.accountEmail) {
    query = query.eq("account_email", patch.accountEmail.toLowerCase());
  }

  const { error } = await query;
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export function senderDisplayFromThread(item: EmailThreadListItem): string {
  if (item.sender.includes("@")) {
    return displaySender(item.sender);
  }
  return item.sender;
}
