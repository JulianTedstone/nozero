import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { loadRoutingConfig, proposeSlug } from "@/lib/routing";

/**
 * Krisp "Note generated" webhook receiver logic.
 *
 * Krisp's exact auth + payload shape sit behind their dashboard, so both are
 * handled defensively: auth accepts an HMAC-SHA256 signature header (`sha256=…`,
 * the groundcrew prototype's scheme) OR a static bearer in `Authorization` (the
 * brief's scheme); the normaliser accepts the common field aliases. Output is the
 * exact `context-ingest/incoming/*.md` format the Ingest reader already parses.
 */

export interface NormalizedKrisp {
  id: string;
  title: string;
  startedAt: string; // ISO
  participants: Array<{ name: string; email?: string; company?: string }>;
  transcript: string;
  notes?: string;
  outline?: string;
  actionItems: string[];
}

const SIGNATURE_HEADERS = [
  "x-krisp-signature",
  "x-signature",
  "x-hub-signature-256",
  "x-webhook-signature",
];

/** True if the request is authentic under either the HMAC or bearer scheme. */
export function verifyKrispWebhook(
  rawBody: string,
  headers: Headers,
  secret: string,
): boolean {
  // 1) HMAC-SHA256 signature header (sha256=<hex>).
  for (const name of SIGNATURE_HEADERS) {
    const provided = headers.get(name);
    if (provided) {
      const mac = createHmac("sha256", secret).update(rawBody).digest("hex");
      const got = provided.replace(/^sha256=/i, "").trim();
      const a = Buffer.from(mac);
      const b = Buffer.from(got);
      if (a.length === b.length && timingSafeEqual(a, b)) return true;
    }
  }
  // 2) Static bearer token in Authorization.
  const auth = headers.get("authorization");
  if (auth) {
    const token = auth.replace(/^bearer\s+/i, "").trim();
    const a = Buffer.from(token);
    const b = Buffer.from(secret);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

function pick(o: Record<string, unknown> | undefined, keys: string[]): unknown {
  if (!o) return undefined;
  for (const k of keys) {
    const v = o[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

function asText(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {
    return v
      .map((seg) =>
        typeof seg === "string"
          ? seg
          : [
              (seg as Record<string, unknown>)?.speaker,
              (seg as Record<string, unknown>)?.text,
            ]
              .filter(Boolean)
              .join(": "),
      )
      .join("\n");
  }
  return v == null ? "" : String(v);
}

function asList(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) {
    return v
      .map((x) =>
        typeof x === "string"
          ? x
          : ((x as Record<string, unknown>)?.text ??
              (x as Record<string, unknown>)?.name ??
              String(x)),
      )
      .map((x) => String(x).trim())
      .filter(Boolean);
  }
  return [String(v)];
}

function asParticipants(
  v: unknown,
): Array<{ name: string; email?: string; company?: string }> {
  if (!Array.isArray(v)) return [];
  return v.map((x) => {
    if (typeof x === "string") return { name: x.trim() };
    const o = x as Record<string, unknown>;
    const name = String(
      o.name ?? o.speaker ?? o.displayName ?? o.fullName ?? o.email ?? "Unknown",
    ).trim();
    const email = typeof o.email === "string" ? o.email : undefined;
    const company =
      typeof o.company === "string"
        ? o.company
        : typeof o.organization === "string"
          ? o.organization
          : undefined;
    return { name, email, company };
  });
}

export function normalizeKrispPayload(payload: unknown): NormalizedKrisp {
  const root = (payload ?? {}) as Record<string, unknown>;
  const meeting = (root.meeting ?? root.data ?? root) as Record<string, unknown>;
  const startedRaw = pick(meeting, [
    "startedAt",
    "started_at",
    "startTime",
    "start_time",
    "date",
    "created_at",
  ]);
  const started = startedRaw ? new Date(String(startedRaw)) : new Date(0);
  const startedAt = Number.isNaN(started.getTime())
    ? new Date(0).toISOString()
    : started.toISOString();

  return {
    id: String(
      pick(meeting, ["id", "meetingId", "meeting_id", "uuid", "noteId"]) ??
        `krisp-${startedAt.slice(0, 10)}`,
    ),
    title: String(
      pick(meeting, ["title", "name", "subject"]) ?? "Untitled meeting",
    ),
    startedAt,
    participants: asParticipants(
      pick(meeting, ["participants", "attendees", "speakers"]),
    ),
    transcript: asText(pick(meeting, ["transcript", "transcription", "text"])),
    notes: asText(pick(meeting, ["notes", "summary", "keyPoints"])) || undefined,
    outline: asText(pick(meeting, ["outline"])) || undefined,
    actionItems: asList(
      pick(meeting, ["actionItems", "action_items", "actions", "todos"]),
    ),
  };
}

function yamlEscape(s: string): string {
  return s.replace(/"/g, '\\"');
}

/** The `incoming/` filename convention: conversation-<meeting_id>-<YYYY-MM-DD>.md */
export function krispFilename(n: NormalizedKrisp): string {
  return `conversation-${n.id}-${n.startedAt.slice(0, 10)}.md`;
}

/** Render to the exact frontmatter + body format pipeline.py / the reader expect. */
export function krispToMarkdown(n: NormalizedKrisp, slug: string): string {
  const date = n.startedAt.slice(0, 10);
  const company =
    n.participants.find((p) => p.company)?.company ?? "";
  const fmParticipants = n.participants
    .map(
      (p) =>
        `  - name: "${yamlEscape(p.name)}"\n    email: "${yamlEscape(p.email ?? "")}"\n    company: "${yamlEscape(p.company ?? "")}"`,
    )
    .join("\n");

  const frontmatter = [
    "---",
    `meeting_id: ${n.id}`,
    `title: ${n.title}`,
    `calendar_title: "${yamlEscape(n.title)}"`,
    `date: ${date}`,
    `slug: ${slug}`,
    `company: "${yamlEscape(company)}"`,
    "source: krisp",
    "participants:",
    fmParticipants || '  - name: "Unknown"\n    email: ""\n    company: ""',
    "---",
  ].join("\n");

  const body: string[] = [`# ${n.title}`, ""];
  body.push("### Action Items", "");
  if (n.actionItems.length) {
    body.push(...n.actionItems.map((a) => `- ${a}`));
  } else {
    body.push("- N/A");
  }
  body.push("");
  const keyPoints = n.notes ?? n.outline ?? "";
  if (keyPoints.trim()) {
    body.push("### Key Points", "", keyPoints.trim(), "");
  }
  body.push("## Transcript", "", n.transcript.trim() || "_(no transcript)_", "");

  return `${frontmatter}\n\n${body.join("\n")}`;
}

/** Compute the proposed slug for an incoming Krisp note from the shared rules. */
export async function proposeSlugForKrisp(n: NormalizedKrisp): Promise<string> {
  const config = await loadRoutingConfig();
  const { slug } = proposeSlug(
    {
      company: n.participants.find((p) => p.company)?.company ?? "",
      calendarTitle: n.title,
      title: n.title,
      meetingId: n.id,
      participantEmails: n.participants
        .map((p) => p.email ?? "")
        .filter(Boolean),
      participantNames: n.participants.map((p) => p.name),
    },
    config,
  );
  return slug;
}
