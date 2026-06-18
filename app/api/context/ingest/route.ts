import { NextResponse } from "next/server";
import { getCurrentAuthUser } from "@/lib/auth-server";
import { getConnectedAccounts } from "@/lib/connected-accounts";
import { inferBindingsForEmail } from "@/lib/context-accounts";
import {
  getIngestConversation,
  listIngestForRepos,
  listPendingIngest,
  setIngestRead,
} from "@/lib/ingest";

export const runtime = "nodejs";

/** Context repos this user can see, derived from their account emails. */
async function reposForUser(userId: string, primaryEmail: string): Promise<string[]> {
  const emails = new Set<string>();
  if (primaryEmail) emails.add(primaryEmail.toLowerCase());
  try {
    for (const account of await getConnectedAccounts(userId)) {
      if (account.email) emails.add(account.email.toLowerCase());
    }
  } catch {
    // Connected-accounts lookup is best-effort — fall back to the primary email.
  }

  const repos = new Set<string>();
  for (const email of emails) {
    for (const binding of inferBindingsForEmail(email)) {
      for (const repo of binding.repos) repos.add(repo.fullName);
    }
  }
  return [...repos];
}

export async function GET(request: Request) {
  const user = await getCurrentAuthUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const repo = searchParams.get("repo")?.trim();
  const path = searchParams.get("path")?.trim();

  // Single-conversation detail.
  if (repo && path) {
    const conversation = await getIngestConversation(user.id, repo, path);
    if (!conversation) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ conversation });
  }

  // Inbox groups. Pending (staged, awaiting approval) lead the conversations
  // list. Fail-safe: neither lister throws.
  const repos = await reposForUser(user.id, user.email);
  const [groups, pending] = await Promise.all([
    listIngestForRepos(user.id, repos),
    listPendingIngest(user.id),
  ]);
  groups.conversations = [...pending, ...groups.conversations];
  return NextResponse.json({ groups, repos });
}

export async function POST(request: Request) {
  const user = await getCurrentAuthUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { id?: unknown; read?: unknown };
  try {
    body = (await request.json()) as { id?: unknown; read?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (typeof body.id !== "string" || !body.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const read = body.read !== false; // default: mark read
  try {
    await setIngestRead(user.id, body.id, read);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Update failed" },
      { status: 500 },
    );
  }
}
