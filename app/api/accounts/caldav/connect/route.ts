import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getSubscriptionsByAccount,
  setSubscriptionsForAccount,
} from "@/lib/calendar-subscriptions";
import { createCalDavClient, testCalDavConnection } from "@/lib/caldav-sync";
import {
  getCalDavCredentials,
  removeCalDavCredentials,
  setCalDavCredentials,
} from "@/lib/caldav-credentials";
import {
  getConnectedAccounts,
  upsertConnectedAccountMeta,
} from "@/lib/connected-accounts";
import { getCurrentAuthUser } from "@/lib/auth-server";

const bodySchema = z.object({
  accountId: z.string().min(1),
  email: z.string().email(),
  serverUrl: z.string().min(1),
  username: z.string().min(1),
  password: z.string().optional(),
  label: z.string().optional(),
  color: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const user = await getCurrentAuthUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request" },
        { status: 400 },
      );
    }

    const { accountId, email, serverUrl, username, password, label, color } =
      parsed.data;

    const existing = await getConnectedAccounts(user.id);
    const meta = existing.find((a) => a.id === accountId);

    const trimmedPassword = password?.trim() ?? "";
    let resolvedPassword = trimmedPassword;
    if (!resolvedPassword) {
      const byNewEmail = await getCalDavCredentials(user.id, email);
      const byOldEmail =
        meta?.email && meta.email !== email
          ? await getCalDavCredentials(user.id, meta.email)
          : null;
      resolvedPassword = byNewEmail?.password ?? byOldEmail?.password ?? "";
    }
    if (!resolvedPassword) {
      return NextResponse.json(
        { error: "Password is required for new CalDAV connections" },
        { status: 400 },
      );
    }

    let testResult: { calendarCount: number; calendarNames: string[] };
    try {
      testResult = await testCalDavConnection({
        serverUrl,
        username,
        password: resolvedPassword,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "CalDAV connection failed";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    if (testResult.calendarCount === 0) {
      return NextResponse.json(
        { error: "Connected to server but no calendars were found" },
        { status: 400 },
      );
    }

    if (meta?.email && meta.email !== email) {
      await removeCalDavCredentials(user.id, meta.email);
    }

    await setCalDavCredentials(user.id, email, {
      serverUrl: serverUrl.trim(),
      username,
      password: resolvedPassword,
    });

    await upsertConnectedAccountMeta(user.id, {
      id: accountId,
      email,
      type: "caldav",
      label: label ?? meta?.label ?? "CalDAV",
      connected: true,
      color: color ?? meta?.color ?? "#8B5CF6",
      serverUrl: serverUrl.trim(),
      username,
    });

    const subsByAccount = await getSubscriptionsByAccount(user.id);
    if (!subsByAccount[accountId]?.length) {
      try {
        const client = await createCalDavClient({
          serverUrl: serverUrl.trim(),
          username,
          password: resolvedPassword,
        });
        const calendars = await client.fetchCalendars();
        const defaultSubs = calendars.slice(0, 1).map((cal) => ({
          calendarId: cal.url ?? cal.displayName ?? "default",
          name: cal.displayName ?? cal.url ?? "Calendar",
          color: color ?? meta?.color ?? "#8B5CF6",
          primary: true,
        }));
        if (defaultSubs.length > 0) {
          await setSubscriptionsForAccount(user.id, accountId, defaultSubs);
        }
      } catch (subError) {
        console.error("[caldav/connect] default subscriptions failed:", subError);
      }
    }

    return NextResponse.json({
      ok: true,
      calendarCount: testResult.calendarCount,
      calendarNames: testResult.calendarNames,
    });
  } catch (error) {
    console.error("[caldav/connect]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
