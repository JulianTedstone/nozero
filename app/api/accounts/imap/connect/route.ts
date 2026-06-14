import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentAuthUser } from "@/lib/auth-server";
import {
  getConnectedAccounts,
  upsertConnectedAccountMeta,
} from "@/lib/connected-accounts";
import {
  getImapCredentials,
  normalizeImapHost,
  removeImapCredentials,
  setImapCredentials,
} from "@/lib/imap-credentials";
import { testImapConnection } from "@/lib/imap-sync";

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
      const byNewEmail = await getImapCredentials(user.id, email);
      const byOldEmail =
        meta?.email && meta.email !== email
          ? await getImapCredentials(user.id, meta.email)
          : null;
      resolvedPassword = byNewEmail?.password ?? byOldEmail?.password ?? "";
    }
    if (!resolvedPassword) {
      return NextResponse.json(
        { error: "Password is required for new IMAP connections" },
        { status: 400 },
      );
    }

    const { host, port, secure } = normalizeImapHost(serverUrl);
    if (!host) {
      return NextResponse.json(
        { error: "Valid IMAP server host is required" },
        { status: 400 },
      );
    }

    const credRecord = {
      host,
      port,
      secure,
      username,
      password: resolvedPassword,
    };

    let testResult: { mailboxCount: number };
    try {
      testResult = await testImapConnection(credRecord);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "IMAP connection failed";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    if (meta?.email && meta.email !== email) {
      await removeImapCredentials(user.id, meta.email);
    }

    await setImapCredentials(user.id, email, credRecord);

    await upsertConnectedAccountMeta(user.id, {
      id: accountId,
      email,
      type: "imap",
      label: label ?? meta?.label ?? "IMAP",
      connected: true,
      color: color ?? meta?.color ?? "#4285F4",
      serverUrl: serverUrl.trim(),
      username,
    });

    return NextResponse.json({
      ok: true,
      mailboxCount: testResult.mailboxCount,
    });
  } catch (error) {
    console.error("[imap/connect]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
