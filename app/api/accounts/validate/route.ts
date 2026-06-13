import { NextResponse } from "next/server";
import { getCurrentAuthUser } from "@/lib/auth-server";
import { testCalDavConnection } from "@/lib/caldav-sync";
import { getCalDavCredentials, listCalDavCredentials } from "@/lib/caldav-credentials";
import {
  getConnectedAccounts,
  listGoogleAccountsForSync,
} from "@/lib/connected-accounts";
import { listEmailAccountViews } from "@/lib/email-preferences";
import { listUserEventsInRange } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Verify each connected account can reach email/calendar data sources. */
export async function POST() {
  const user = await getCurrentAuthUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = user.id;
  const accounts = await getConnectedAccounts(userId);
  const emailViews = await listEmailAccountViews(userId);
  const googleSync = await listGoogleAccountsForSync(userId);
  const caldavStored = await listCalDavCredentials(userId);

  const now = new Date();
  const rangeStart = new Date(now);
  rangeStart.setDate(rangeStart.getDate() - 30);
  const rangeEnd = new Date(now);
  rangeEnd.setDate(rangeEnd.getDate() + 90);
  const events = await listUserEventsInRange(userId, rangeStart, rangeEnd);

  const results: Array<{
    id: string;
    email: string;
    type: string;
    credentials: "ok" | "missing" | "invalid";
    emailEnabled: boolean;
    eventsInRange: number;
    detail?: string;
  }> = [];

  for (const account of accounts) {
    if (account.id === "primary-google") continue;

    const emailView = emailViews.find(
      (v) => v.email.toLowerCase() === account.email.toLowerCase(),
    );

    if (account.type === "google") {
      const hasToken = googleSync.some(
        (g) => g.email.toLowerCase() === account.email.toLowerCase(),
      );
      const accountEvents = events.filter(
        (e) =>
          (e as { accountEmail?: string }).accountEmail?.toLowerCase() ===
          account.email.toLowerCase(),
      );
      results.push({
        id: account.id,
        email: account.email,
        type: account.type,
        credentials: hasToken ? "ok" : "missing",
        emailEnabled: emailView?.connected === true && emailView.visible !== false,
        eventsInRange: accountEvents.length,
        detail: hasToken ? undefined : "No OAuth tokens for this Google account",
      });
      continue;
    }

    if (account.type === "caldav") {
      const creds =
        (await getCalDavCredentials(userId, account.email)) ??
        caldavStored.find((c) => c.email.toLowerCase() === account.email.toLowerCase());
      if (!creds?.password) {
        results.push({
          id: account.id,
          email: account.email,
          type: account.type,
          credentials: "missing",
          emailEnabled: false,
          eventsInRange: 0,
          detail: "No CalDAV password stored — reconnect and enter app password",
        });
        continue;
      }

      try {
        await testCalDavConnection({
          serverUrl: creds.serverUrl,
          username: creds.username,
          password: creds.password,
        });
        const accountEvents = events.filter(
          (e) =>
            (e as { accountEmail?: string }).accountEmail?.toLowerCase() ===
            account.email.toLowerCase(),
        );
        results.push({
          id: account.id,
          email: account.email,
          type: account.type,
          credentials: "ok",
          emailEnabled: false,
          eventsInRange: accountEvents.length,
        });
      } catch (error) {
        results.push({
          id: account.id,
          email: account.email,
          type: account.type,
          credentials: "invalid",
          emailEnabled: false,
          eventsInRange: 0,
          detail:
            error instanceof Error ? error.message : "CalDAV connection failed",
        });
      }
      continue;
    }

    results.push({
      id: account.id,
      email: account.email,
      type: account.type,
      credentials: "missing",
      emailEnabled: emailView?.connected === true,
      eventsInRange: 0,
      detail: "IMAP credentials are not stored server-side yet",
    });
  }

  const primaryEmail = user.email?.toLowerCase();
  if (primaryEmail) {
    const primaryEvents = events.filter(
      (e) =>
        !(e as { accountEmail?: string }).accountEmail ||
        (e as { accountEmail?: string }).accountEmail?.toLowerCase() === primaryEmail,
    );
    const primaryEmailView = emailViews.find((v) => v.isPrimary);
    results.unshift({
      id: "primary-google",
      email: user.email ?? primaryEmail,
      type: "google",
      credentials:
        googleSync.some((g) => g.isPrimary) || user.provider === "google"
          ? "ok"
          : "missing",
      emailEnabled: primaryEmailView?.visible !== false,
      eventsInRange: primaryEvents.length,
    });
  }

  const allOk = results.every((r) => r.credentials === "ok");

  return NextResponse.json({
    ok: allOk,
    checkedAt: new Date().toISOString(),
    emailAccountCount: emailViews.filter((a) => a.connected && a.visible).length,
    totalEventsInRange: events.length,
    accounts: results,
  });
}
