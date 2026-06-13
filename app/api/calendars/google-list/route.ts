import { type NextRequest, NextResponse } from "next/server";
import { getCurrentAuthUser } from "@/lib/auth-server";
import { listGoogleAccountsForSync } from "@/lib/connected-accounts";
import { getGoogleCalendars } from "@/lib/google-calendar";
import {
  getConnectedAccountTokens,
  getValidAccessToken,
} from "@/lib/google-tokens";

export async function GET(_req: NextRequest) {
  try {
    const user = await getCurrentAuthUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const linked = await listGoogleAccountsForSync(user.id);
    if (linked.length === 0) {
      return NextResponse.json({ connected: false, calendars: [] });
    }

    const connected = await getConnectedAccountTokens(user.id);
    const connectedByEmail = new Map(
      connected.map((t) => [t.email.toLowerCase(), t]),
    );

    const calendars: Awaited<ReturnType<typeof getGoogleCalendars>> = [];

    for (const account of linked) {
      let accessToken = account.accessToken;
      if (!account.isPrimary) {
        const token = connectedByEmail.get(account.email.toLowerCase());
        if (token) {
          const refreshed = await getValidAccessToken(user.id, token);
          if (refreshed) accessToken = refreshed;
        }
      }

      const accountCalendars = await getGoogleCalendars(
        user.id,
        accessToken,
        account.refreshToken,
        account.expiresAt,
      );

      for (const cal of accountCalendars) {
        calendars.push({
          ...cal,
          accountEmail: account.email,
          summary: cal.summary?.includes(account.email)
            ? cal.summary
            : `${cal.summary ?? cal.id} (${account.email})`,
        });
      }
    }

    return NextResponse.json({ connected: true, calendars });
  } catch (error) {
    console.error("Error fetching Google calendars:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
