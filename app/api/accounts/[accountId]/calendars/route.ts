import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createCalDavClient } from "@/lib/caldav-sync";
import {
  defaultGoogleSubscriptions,
  getSubscriptionsByAccount,
  setSubscriptionsForAccount,
  type CalendarSubscription,
} from "@/lib/calendar-subscriptions";
import {
  getConnectedAccounts,
  listGoogleAccountsForSync,
} from "@/lib/connected-accounts";
import { getGoogleCalendars } from "@/lib/google-calendar";
import {
  getConnectedAccountTokens,
  getValidAccessToken,
} from "@/lib/google-tokens";
import { getCurrentAuthUser } from "@/lib/auth-server";
import { getCalDavCredentials } from "@/lib/caldav-credentials";

async function resolveGoogleAccount(
  userId: string,
  accountId: string,
  userEmail: string | undefined,
) {
  const linked = await listGoogleAccountsForSync(userId);
  if (accountId === "primary-google") {
    const primary = linked.find((a) => a.isPrimary);
    if (!primary) return null;
    return { ...primary, accountId: "primary-google" as const };
  }

  const meta = (await getConnectedAccounts(userId)).find(
    (a) => a.id === accountId && a.type === "google",
  );
  if (!meta) return null;

  const account = linked.find(
    (a) => a.email.toLowerCase() === meta.email.toLowerCase(),
  );
  if (!account) return null;

  return { ...account, accountId: meta.id };
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ accountId: string }> },
) {
  try {
    const user = await getCurrentAuthUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { accountId } = await context.params;
    const connected = await getConnectedAccounts(user.id);
    const account =
      accountId === "primary-google"
        ? {
            id: "primary-google",
            email: user.email ?? "",
            type: "google" as const,
            connected: true,
          }
        : connected.find((a) => a.id === accountId);

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const subscriptionsByAccount = await getSubscriptionsByAccount(user.id);
    const subscribed = subscriptionsByAccount[accountId] ?? [];

    if (account.type === "google") {
      const googleAccount = await resolveGoogleAccount(
        user.id,
        accountId,
        user.email ?? undefined,
      );
      if (!googleAccount) {
        return NextResponse.json(
          { error: "Google account not connected" },
          { status: 400 },
        );
      }

      let accessToken = googleAccount.accessToken;
      if (!googleAccount.isPrimary) {
        const tokens = await getConnectedAccountTokens(user.id);
        const token = tokens.find(
          (t) => t.email.toLowerCase() === googleAccount.email.toLowerCase(),
        );
        if (token) {
          const refreshed = await getValidAccessToken(user.id, token);
          if (refreshed) accessToken = refreshed;
        }
      }

      const available = await getGoogleCalendars(
        user.id,
        accessToken,
        googleAccount.refreshToken,
        googleAccount.expiresAt,
      );

      return NextResponse.json({
        accountId,
        accountEmail: googleAccount.email,
        sourceType: "google",
        available: available.map((cal) => ({
          calendarId: cal.id,
          name: cal.summary,
          color: cal.backgroundColor,
          primary: cal.primary,
          accessRole: cal.accessRole,
        })),
        subscribed,
        defaultSubscribed: defaultGoogleSubscriptions(available),
      });
    }

    if (account.type === "caldav") {
      const creds = await getCalDavCredentials(user.id, account.email);
      if (!creds) {
        return NextResponse.json(
          { error: "CalDAV account not connected" },
          { status: 400 },
        );
      }

      const client = await createCalDavClient(creds);
      const calendars = await client.fetchCalendars();
      const available = calendars.map((cal) => ({
        calendarId: cal.url ?? cal.displayName ?? "default",
        name: cal.displayName ?? cal.url ?? "Calendar",
        color: "#8B5CF6",
        primary: false,
      }));

      return NextResponse.json({
        accountId,
        accountEmail: account.email,
        sourceType: "caldav",
        available,
        subscribed,
        defaultSubscribed: available.slice(0, 1),
      });
    }

    return NextResponse.json({ error: "Unsupported account type" }, { status: 400 });
  } catch (error) {
    console.error("[accounts/calendars GET]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

const putSchema = z.object({
  subscribed: z.array(
    z.object({
      calendarId: z.string().min(1),
      name: z.string().min(1),
      color: z.string().min(1),
      primary: z.boolean().optional(),
    }),
  ),
});

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ accountId: string }> },
) {
  try {
    const user = await getCurrentAuthUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { accountId } = await context.params;
    const parsed = putSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid body" },
        { status: 400 },
      );
    }

    if (accountId !== "primary-google") {
      const connected = await getConnectedAccounts(user.id);
      const account = connected.find((a) => a.id === accountId);
      if (!account) {
        return NextResponse.json({ error: "Account not found" }, { status: 404 });
      }
    }

    await setSubscriptionsForAccount(
      user.id,
      accountId,
      parsed.data.subscribed as CalendarSubscription[],
    );

    return NextResponse.json({ ok: true, subscribed: parsed.data.subscribed });
  } catch (error) {
    console.error("[accounts/calendars PUT]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
