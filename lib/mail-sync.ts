import "server-only";

import { getConnectedAccounts } from "@/lib/connected-accounts";
import {
  enabledAccountEmails,
  listEmailAccountViews,
} from "@/lib/email-preferences";
import { listGmailThreadSummaries, getGmailThreadDetail } from "@/lib/gmail-sync";
import {
  getGoogleMailAuthForEmail,
  listGoogleMailAuths,
} from "@/lib/google-mail-auth";
import { getImapCredentials, listImapCredentials } from "@/lib/imap-credentials";
import { getImapThreadDetail, listImapThreadSummaries } from "@/lib/imap-sync";
import type { EmailThreadDetail, EmailThreadSummary } from "@/types/email";

export type MailAccountKind = "google" | "imap";

export async function mailAccountKindForEmail(
  userId: string,
  email: string,
): Promise<MailAccountKind | null> {
  const target = email.toLowerCase();
  const connected = await getConnectedAccounts(userId);
  const meta = connected.find((a) => a.email.toLowerCase() === target);
  if (meta?.type === "imap") return "imap";
  if (meta?.type === "google") return "google";

  const imap = await getImapCredentials(userId, email);
  if (imap) return "imap";

  const google = await getGoogleMailAuthForEmail(userId, email);
  if (google) return "google";

  return null;
}

export async function syncMailThreadsForUser(
  userId: string,
  limit = 40,
): Promise<{ synced: number; errors: string[] }> {
  const accounts = await listEmailAccountViews(userId);
  const enabled = enabledAccountEmails(accounts);
  if (enabled.length === 0) {
    return { synced: 0, errors: ["No email accounts enabled"] };
  }

  const errors: string[] = [];
  let synced = 0;

  const googleAuths = await listGoogleMailAuths(userId, enabled);
  const authedGoogle = new Set(googleAuths.map((a) => a.email.toLowerCase()));

  for (const auth of googleAuths) {
    const { threads, error } = await listGmailThreadSummaries(
      auth.accessToken,
      limit,
    );
    if (error) errors.push(`${auth.email}: ${error}`);
    synced += threads.length;
    await persistThreadSummaries(userId, auth.email, threads);
  }

  const imapStored = await listImapCredentials(userId);
  const imapEmails = new Set(
    imapStored.map((c) => c.email.toLowerCase()).filter((e) => enabled.includes(e)),
  );

  const { listGoogleAccountsForSync } = await import("@/lib/connected-accounts");
  for (const linked of await listGoogleAccountsForSync(userId)) {
    const email = linked.email.toLowerCase();
    if (!enabled.includes(email)) continue;
    if (authedGoogle.has(email) || imapEmails.has(email)) continue;
    errors.push(
      `${linked.email}: Google token unavailable — use Settings → Reconnect Google (Calendar & Gmail)`,
    );
  }

  for (const email of imapEmails) {
    const creds = await getImapCredentials(userId, email);
    if (!creds) continue;
    const { threads, error } = await listImapThreadSummaries(creds, limit);
    if (error) errors.push(`${email}: ${error}`);
    synced += threads.length;
    await persistThreadSummaries(userId, email, threads);
  }

  const covered = new Set([
    ...googleAuths.map((a) => a.email.toLowerCase()),
    ...imapEmails,
  ]);
  for (const email of enabled) {
    if (!covered.has(email)) {
      errors.push(`${email}: no mail credentials — connect Google or IMAP`);
    }
  }

  return { synced, errors };
}

async function persistThreadSummaries(
  userId: string,
  accountEmail: string,
  threads: EmailThreadSummary[],
) {
  const { upsertThreadSummary } = await import("@/lib/email-store");
  for (const thread of threads) {
    await upsertThreadSummary(userId, thread, accountEmail, { enrich: false });
  }
}

export async function fetchMailThreadDetail(
  userId: string,
  threadId: string,
  accountEmail: string,
): Promise<{ detail: EmailThreadDetail | null; error?: string }> {
  const kind = await mailAccountKindForEmail(userId, accountEmail);
  if (kind === "google") {
    const auth = await getGoogleMailAuthForEmail(userId, accountEmail);
    if (!auth) {
      return { detail: null, error: "Google mail credentials missing" };
    }
    const { detail, error } = await getGmailThreadDetail(
      auth.accessToken,
      threadId,
    );
    if (detail) {
      detail.thread.accountEmail = accountEmail;
    }
    return { detail, error };
  }

  if (kind === "imap") {
    const creds = await getImapCredentials(userId, accountEmail);
    if (!creds) {
      return { detail: null, error: "IMAP credentials missing" };
    }
    const { detail, error } = await getImapThreadDetail(creds, threadId);
    if (detail) {
      detail.thread.accountEmail = accountEmail;
    }
    return { detail, error };
  }

  return { detail: null, error: "Unknown mail account type" };
}
