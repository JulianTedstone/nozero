import "server-only";

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { extractSenderEmail } from "@/lib/email-body";
import type { ImapCredentialRecord } from "@/lib/imap-credentials";
import type {
  EmailMessage,
  EmailThreadDetail,
  EmailThreadSummary,
} from "@/types/email";

const DEFAULT_SYNC_DAYS = 30;

function threadKeyFromHeaders(input: {
  messageId?: string;
  inReplyTo?: string;
  references?: string;
  subject?: string;
}): string {
  const refs = input.references?.trim().split(/\s+/).filter(Boolean) ?? [];
  const root =
    refs[0] ??
    input.inReplyTo?.replace(/^<|>$/g, "") ??
    input.messageId?.replace(/^<|>$/g, "");
  if (root) return root.toLowerCase();
  const subject = (input.subject ?? "(no subject)")
    .replace(/^(re|fwd?):\s*/gi, "")
    .trim()
    .toLowerCase();
  return `subject:${subject}`;
}

function createImapClient(creds: ImapCredentialRecord): ImapFlow {
  return new ImapFlow({
    host: creds.host,
    port: creds.port,
    secure: creds.secure,
    auth: {
      user: creds.username,
      pass: creds.password,
    },
    logger: false,
  });
}

export async function testImapConnection(
  creds: ImapCredentialRecord,
): Promise<{ ok: true; mailboxCount: number }> {
  const client = createImapClient(creds);
  await client.connect();
  try {
    const list = await client.list();
    return { ok: true, mailboxCount: list.length };
  } finally {
    await client.logout();
  }
}

type ParsedImapMessage = {
  uid: number;
  threadKey: string;
  message: EmailMessage;
  unread: boolean;
};

async function fetchRecentMessages(
  creds: ImapCredentialRecord,
  limit: number,
): Promise<{ messages: ParsedImapMessage[]; error?: string }> {
  const client = createImapClient(creds);
  await client.connect();

  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const since = new Date();
      since.setDate(since.getDate() - DEFAULT_SYNC_DAYS);

      const uids = await client.search({ since }, { uid: true });
      const uidList = (uids as number[]).slice(-limit * 3);
      if (uidList.length === 0) return { messages: [] };

      const parsed: ParsedImapMessage[] = [];
      for await (const msg of client.fetch(
        uidList,
        { uid: true, source: true, flags: true },
        { uid: true },
      )) {
        if (!msg.source) continue;
        const mail = await simpleParser(msg.source);
        const messageId = mail.messageId ?? `uid-${msg.uid}`;
        const threadKey = threadKeyFromHeaders({
          messageId,
          inReplyTo: mail.inReplyTo ?? undefined,
          references: Array.isArray(mail.references)
            ? mail.references.join(" ")
            : mail.references ?? undefined,
          subject: mail.subject ?? undefined,
        });

        const from = mail.from?.value?.[0]
          ? `${mail.from.value[0].name ? `${mail.from.value[0].name} ` : ""}<${mail.from.value[0].address}>`
          : "";

        parsed.push({
          uid: msg.uid,
          threadKey,
          unread: !msg.flags?.has("\\Seen"),
          message: {
            id: messageId,
            threadId: threadKey,
            from,
            to: (mail.to?.value ?? []).map(
              (v) => `${v.name ? `${v.name} ` : ""}<${v.address}>`,
            ),
            cc: (mail.cc?.value ?? []).map(
              (v) => `${v.name ? `${v.name} ` : ""}<${v.address}>`,
            ),
            subject: mail.subject ?? "(No subject)",
            body: mail.text ?? mail.html ?? "",
            bodyHtml: typeof mail.html === "string" ? mail.html : null,
            date: mail.date?.toISOString() ?? null,
          },
        });
      }

      return { messages: parsed };
    } finally {
      lock.release();
    }
  } catch (error) {
    return {
      messages: [],
      error: error instanceof Error ? error.message : "IMAP sync failed",
    };
  } finally {
    await client.logout();
  }
}

function groupIntoThreads(
  messages: ParsedImapMessage[],
  limit: number,
): EmailThreadSummary[] {
  const byThread = new Map<
    string,
    { messages: ParsedImapMessage[]; unread: boolean }
  >();

  for (const item of messages) {
    const bucket = byThread.get(item.threadKey) ?? {
      messages: [],
      unread: false,
    };
    bucket.messages.push(item);
    bucket.unread = bucket.unread || item.unread;
    byThread.set(item.threadKey, bucket);
  }

  const summaries: EmailThreadSummary[] = [];
  for (const [threadKey, bucket] of byThread) {
    const sorted = [...bucket.messages].sort((a, b) => {
      const at = a.message.date ? new Date(a.message.date).getTime() : 0;
      const bt = b.message.date ? new Date(b.message.date).getTime() : 0;
      return at - bt;
    });
    const latest = sorted.at(-1)!.message;
    const participants = new Set<string>();
    for (const item of sorted) {
      if (item.message.from) {
        participants.add(extractSenderEmail(item.message.from));
      }
      for (const to of item.message.to) {
        participants.add(extractSenderEmail(to));
      }
    }

    summaries.push({
      id: threadKey,
      subject: latest.subject,
      snippet: latest.body.slice(0, 160) || null,
      date: latest.date,
      participants: [...participants],
      unread: bucket.unread,
      messageCount: sorted.length,
    });
  }

  summaries.sort((a, b) => {
    const at = a.date ? new Date(a.date).getTime() : 0;
    const bt = b.date ? new Date(b.date).getTime() : 0;
    return bt - at;
  });

  return summaries.slice(0, limit);
}

export async function listImapThreadSummaries(
  creds: ImapCredentialRecord,
  limit = 40,
): Promise<{ threads: EmailThreadSummary[]; error?: string }> {
  const { messages, error } = await fetchRecentMessages(creds, limit);
  if (error) return { threads: [], error };
  return { threads: groupIntoThreads(messages, limit) };
}

export async function getImapThreadDetail(
  creds: ImapCredentialRecord,
  threadId: string,
): Promise<{ detail: EmailThreadDetail | null; error?: string }> {
  const { messages, error } = await fetchRecentMessages(creds, 200);
  if (error) return { detail: null, error };

  const inThread = messages.filter((m) => m.threadKey === threadId);
  if (inThread.length === 0) {
    return { detail: null, error: "Thread not found" };
  }

  const sorted = [...inThread].sort((a, b) => {
    const at = a.message.date ? new Date(a.message.date).getTime() : 0;
    const bt = b.message.date ? new Date(b.message.date).getTime() : 0;
    return at - bt;
  });

  const latest = sorted.at(-1)!.message;
  const participants = new Set<string>();
  for (const item of sorted) {
    if (item.message.from) {
      participants.add(extractSenderEmail(item.message.from));
    }
    for (const to of item.message.to) {
      participants.add(extractSenderEmail(to));
    }
  }

  const summary: EmailThreadSummary = {
    id: threadId,
    subject: latest.subject,
    snippet: latest.body.slice(0, 160) || null,
    date: latest.date,
    participants: [...participants],
    unread: sorted.some((m) => m.unread),
    messageCount: sorted.length,
  };

  return {
    detail: {
      thread: {
        ...summary,
        sender: latest.from || summary.participants[0] || "Unknown",
        aiSummary: null,
        tracking: false,
        archived: false,
        accountEmail: "",
        streams: [],
      },
      messages: sorted.map((m) => m.message),
    },
  };
}
