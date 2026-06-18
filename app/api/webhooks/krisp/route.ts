import { NextResponse } from "next/server";
import { getRepoFile, putRepoFile } from "@/lib/github-content";
import {
  krispFilename,
  krispToMarkdown,
  normalizeKrispPayload,
  proposeSlugForKrisp,
  verifyKrispWebhook,
} from "@/lib/krisp-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INGEST_REPO = "juliantedstone/context-ingest";
const INCOMING_DIR = "incoming";

/**
 * Krisp "Note generated" webhook → commit the note to context-ingest/incoming/
 * so it flows into the nozero Ingest gate. Replaces the dead
 * api.nopilot.services/webhooks/krisp receiver. Point Krisp at
 * https://zero.nopilot.co/api/webhooks/krisp.
 *
 * Returns 200 on success/duplicate; 401 bad signature; 503 if unconfigured;
 * 5xx on a transient commit failure so Krisp retries.
 */
export async function POST(request: Request) {
  const secret = process.env.KRISP_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "KRISP_WEBHOOK_SECRET not configured" },
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  if (!verifyKrispWebhook(rawBody, request.headers, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const note = normalizeKrispPayload(payload);
  const filename = krispFilename(note);
  const path = `${INCOMING_DIR}/${filename}`;

  // Idempotent: a re-delivered note (same meeting_id) is a no-op.
  try {
    await getRepoFile(INGEST_REPO, path);
    return NextResponse.json({ ok: true, id: note.id, duplicate: true });
  } catch {
    // not present (or unreachable) — proceed to write
  }

  try {
    const slug = await proposeSlugForKrisp(note);
    const markdown = krispToMarkdown(note, slug);
    await putRepoFile({
      fullName: INGEST_REPO,
      path,
      content: markdown,
      message: `krisp: ingest "${note.title}" (${note.id})`,
    });
    return NextResponse.json({ ok: true, id: note.id, path, slug });
  } catch (err) {
    // 5xx so Krisp retries the delivery.
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Commit failed" },
      { status: 502 },
    );
  }
}
