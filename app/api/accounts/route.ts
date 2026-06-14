import { NextResponse } from "next/server";
import { getCurrentAuthUser } from "@/lib/auth-server";
import { removeCalDavCredentials } from "@/lib/caldav-credentials";
import { removeImapCredentials } from "@/lib/imap-credentials";
import {
  getConnectedAccounts,
  removeConnectedAccountMeta,
  removeConnectedToken,
  saveConnectedAccounts,
  type ConnectedAccountMeta,
} from "@/lib/connected-accounts";
import { getUserRecord } from "@/lib/store";

export async function GET() {
  try {
    const user = await getCurrentAuthUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const accounts = await getConnectedAccounts(user.id);
    const { listCalDavCredentials } = await import("@/lib/caldav-credentials");
    const { listImapCredentials } = await import("@/lib/imap-credentials");
    const caldavEmails = new Set(
      (await listCalDavCredentials(user.id)).map((c) => c.email.toLowerCase()),
    );
    const imapEmails = new Set(
      (await listImapCredentials(user.id)).map((c) => c.email.toLowerCase()),
    );

    const enriched = accounts.map((a) => {
      const hasStored =
        (a.type === "caldav" && caldavEmails.has(a.email.toLowerCase())) ||
        (a.type === "imap" && imapEmails.has(a.email.toLowerCase()));
      return {
        ...a,
        hasStoredCredentials: hasStored,
        connected: hasStored ? true : a.connected,
      };
    });

    return NextResponse.json({
      primaryEmail: user.email,
      accounts: enriched,
    });
  } catch (error) {
    console.error("[accounts GET]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const user = await getCurrentAuthUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as { accounts?: ConnectedAccountMeta[] };
    if (!Array.isArray(body.accounts)) {
      return NextResponse.json({ error: "accounts array required" }, { status: 400 });
    }

    const sanitized = body.accounts
      .filter((a) => a.id !== "primary-google")
      .map(({ id, email, type, label, connected, color, serverUrl, username }) => ({
        id,
        email,
        type,
        label,
        connected,
        color,
        serverUrl,
        username,
      }));

    const existing = (await getConnectedAccounts(user.id)).filter(
      (a) => a.id !== "primary-google",
    );
    const incomingIds = new Set(sanitized.map((a) => a.id));
    const preserved = existing.filter((a) => !incomingIds.has(a.id));
    const merged = [...preserved, ...sanitized];

    await saveConnectedAccounts(user.id, merged);
    return NextResponse.json({ ok: true, accounts: merged });
  } catch (error) {
    console.error("[accounts PUT]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getCurrentAuthUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");
    const email = searchParams.get("email");

    if (!accountId) {
      return NextResponse.json({ error: "accountId required" }, { status: 400 });
    }

    if (accountId === "primary-google") {
      return NextResponse.json(
        { error: "Cannot remove primary login account" },
        { status: 400 },
      );
    }

    await removeConnectedAccountMeta(user.id, accountId);

    const profile = await getUserRecord(user.id);
    const primaryEmail = profile?.email?.toLowerCase();
    if (email) {
      if (email.toLowerCase() !== primaryEmail) {
        await removeConnectedToken(user.id, email);
      }
      await removeCalDavCredentials(user.id, email);
      await removeImapCredentials(user.id, email);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[accounts DELETE]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
