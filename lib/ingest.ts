import "server-only";

import {
  deleteRepoFile,
  getRepoFile,
  getRepoTree,
  putRepoFile,
} from "@/lib/github-content";
import {
  appendCorrection,
  buildConversationFilename,
  loadRoutingConfig,
  proposeSlug,
  type RoutingField,
  type RoutingItem,
  type RoutingOp,
  routePathForSlug,
  slugifyText,
} from "@/lib/routing";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  IngestAction,
  IngestConversation,
  IngestDeal,
  IngestGroups,
  IngestItemSummary,
  IngestParticipant,
  IngestSection,
} from "@/types/ingest";

/**
 * Ingest — observability over the context ingestion pipeline.
 *
 * A deterministic background routine (the "sorting office") pulls inbound
 * content into the context-message-* repos: meeting conversations land in
 * `<repo>/conversations/*.md`, messages in `<repo>/messaging/*`, raw drops in
 * `<repo>/drops/*`. nozero does not run that routine — it reads the routed
 * output so the user has an inbox: what landed, whether it's been seen, and
 * (per item) the full meeting context.
 *
 * Reads are FAIL-SAFE: any GitHub error degrades to an empty group rather than
 * breaking the Context page. The list is derived from the repo tree alone (one
 * API call per repo); full frontmatter is only fetched when an item is opened.
 */

export type {
  IngestAction,
  IngestConversation,
  IngestDeal,
  IngestGroups,
  IngestItemSummary,
  IngestParticipant,
  IngestSection,
} from "@/types/ingest";

// The staging "sorting office": pipeline.py drops raw Krisp meetings here with a
// proposed slug; nozero is the approve/correct gate that moves them to scope repos.
const INGEST_REPO = "juliantedstone/context-ingest";
const INCOMING_DIR = "incoming/";

const CONVERSATIONS_DIR = "conversations/";
const MESSAGING_DIR = "messaging/";
const DROPS_DIR = "drops/";
const MAX_PER_SECTION = 60;

// Default Flightdeck stream per context repo, used when a conversation has no
// explicit `streams:` and the user turns an action into a task.
const REPO_DEFAULT_STREAM: Record<string, string> = {
  "context-message-nopilot": "npt-nopilot",
  "context-message-360": "npt-360",
  "context-message-ted": "npt-job-search",
};

function defaultStreamForRepo(repo: string): string | null {
  const name = repo.split("/").pop() ?? repo;
  return REPO_DEFAULT_STREAM[name] ?? null;
}

export function ingestItemId(repo: string, path: string): string {
  return `${repo}:${path}`;
}

// ── read-state (profiles.preferences.ingestRead) ────────────────────────────

export async function getIngestReadSet(userId: string): Promise<Set<string>> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("preferences")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return new Set();
  const prefs = (data.preferences ?? {}) as Record<string, unknown>;
  const raw = prefs.ingestRead;
  return new Set(Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : []);
}

export async function setIngestRead(
  userId: string,
  id: string,
  read: boolean,
): Promise<void> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("preferences")
    .eq("id", userId)
    .maybeSingle();
  const prefs = (data?.preferences ?? {}) as Record<string, unknown>;
  const current = new Set(
    Array.isArray(prefs.ingestRead)
      ? (prefs.ingestRead as unknown[]).filter((v): v is string => typeof v === "string")
      : [],
  );
  if (read) current.add(id);
  else current.delete(id);
  await admin
    .from("profiles")
    .update({ preferences: { ...prefs, ingestRead: [...current] } })
    .eq("id", userId);
}

// ── filename-derived summaries (cheap: tree-only) ───────────────────────────

// Pipeline filenames: conversation-<slug>-<title>-<surnames>-YYYY-MM-DD.md
// (raw incoming files use a hash in place of slug/title; those get their real
// title from frontmatter in listPendingIngest).
const CONVO_FILENAME_RE = /^conversation-(.+)-(\d{4})-(\d{2})-(\d{2})\.md$/i;

function baseName(path: string): string {
  return path.split("/").pop() ?? path;
}

function titleCaseLabel(raw: string): string {
  return raw
    .replace(/[_-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function summaryFromConversationPath(
  repo: string,
  path: string,
  readSet: Set<string>,
): IngestItemSummary {
  const id = ingestItemId(repo, path);
  const file = baseName(path);
  const match = file.match(CONVO_FILENAME_RE);
  let label = file.replace(/\.md$/i, "");
  let date: string | null = null;
  if (match) {
    const [, who, yyyy, mm, dd] = match;
    const withoutSlug = who.replace(/^(360|pod|coh|ted)-/i, "");
    label = titleCaseLabel(withoutSlug);
    date = `${yyyy}-${mm}-${dd}`;
  }
  return {
    id,
    section: "conversations",
    repo,
    path,
    channel: "krisp",
    title: label || file,
    participantsLabel: label,
    date,
    unread: !readSet.has(id),
  };
}

function genericSummary(
  section: IngestSection,
  repo: string,
  path: string,
  readSet: Set<string>,
): IngestItemSummary {
  const id = ingestItemId(repo, path);
  const file = baseName(path);
  return {
    id,
    section,
    repo,
    path,
    channel: section === "messaging" ? "message" : "drop",
    title: titleCaseLabel(file.replace(/\.[a-z0-9]+$/i, "")),
    participantsLabel: "",
    date: null,
    unread: !readSet.has(id),
  };
}

function byDateDesc(a: IngestItemSummary, b: IngestItemSummary): number {
  if (a.date && b.date) return b.date.localeCompare(a.date);
  if (a.date) return -1;
  if (b.date) return 1;
  return b.path.localeCompare(a.path);
}

/** Build the inbox groups for the given repos. Fail-safe per repo. */
export async function listIngestForRepos(
  userId: string,
  repos: string[],
): Promise<IngestGroups> {
  const readSet = await getIngestReadSet(userId);
  const groups: IngestGroups = {
    conversations: [],
    messaging: [],
    drops: [],
  };

  await Promise.all(
    repos.map(async (repo) => {
      let paths: string[] = [];
      try {
        ({ paths } = await getRepoTree(repo));
      } catch {
        return; // repo missing / token issue — skip silently
      }
      for (const path of paths) {
        if (path.startsWith(CONVERSATIONS_DIR) && path.toLowerCase().endsWith(".md")) {
          groups.conversations.push(summaryFromConversationPath(repo, path, readSet));
        } else if (path.startsWith(MESSAGING_DIR)) {
          groups.messaging.push(genericSummary("messaging", repo, path, readSet));
        } else if (path.startsWith(DROPS_DIR)) {
          groups.drops.push(genericSummary("drops", repo, path, readSet));
        }
      }
    }),
  );

  groups.conversations.sort(byDateDesc);
  groups.messaging.sort(byDateDesc);
  groups.drops.sort(byDateDesc);
  groups.conversations = groups.conversations.slice(0, MAX_PER_SECTION);
  groups.messaging = groups.messaging.slice(0, MAX_PER_SECTION);
  groups.drops = groups.drops.slice(0, MAX_PER_SECTION);
  return groups;
}

// ── frontmatter parser (constrained, dependency-free) ───────────────────────

type FmValue = string | string[] | Array<Record<string, string>>;

function stripQuotes(v: string): string {
  const t = v.trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return t.slice(1, -1);
  }
  return t;
}

function indentOf(line: string): number {
  const m = line.match(/^( *)/);
  return m ? m[1].length : 0;
}

/**
 * Parse the subset of YAML the conversation convention uses: top-level
 * `key: value`, inline `[a, b]`, block scalars (`key: |`), block lists of
 * scalars (`- a`) and block lists of objects (`- key: value` + indented pairs).
 */
function parseFrontmatter(raw: string): {
  data: Record<string, FmValue>;
  body: string;
} {
  const text = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const fence = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!fence) return { data: {}, body: text.trim() };

  const fm = fence[1].split("\n");
  const body = text.slice(fence[0].length).trim();
  const data: Record<string, FmValue> = {};

  let i = 0;
  while (i < fm.length) {
    const line = fm[i];
    if (!line.trim() || indentOf(line) > 0) {
      i++;
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) {
      i++;
      continue;
    }
    const key = kv[1];
    const inline = kv[2];

    // Block scalar: `key: |` or `key: >`
    if (inline === "|" || inline === ">") {
      const collected: string[] = [];
      i++;
      while (i < fm.length && (fm[i].trim() === "" || indentOf(fm[i]) >= 2)) {
        collected.push(fm[i].replace(/^ {2}/, ""));
        i++;
      }
      data[key] = collected.join(inline === ">" ? " " : "\n").trim();
      continue;
    }

    // Inline array: `key: [a, b]`
    if (inline.startsWith("[") && inline.endsWith("]")) {
      data[key] = inline
        .slice(1, -1)
        .split(",")
        .map((s) => stripQuotes(s))
        .filter(Boolean);
      i++;
      continue;
    }

    // Scalar: `key: value`
    if (inline !== "") {
      data[key] = stripQuotes(inline);
      i++;
      continue;
    }

    // Block list under `key:` — collect indented `- …` items
    const items: string[] = [];
    const objs: Array<Record<string, string>> = [];
    i++;
    let sawObject = false;
    while (i < fm.length) {
      const cur = fm[i];
      if (cur.trim() === "") {
        i++;
        continue;
      }
      const ind = indentOf(cur);
      if (ind === 0) break;
      const dash = cur.match(/^\s*-\s+(.*)$/);
      if (dash) {
        const rest = dash[1];
        const objKv = rest.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
        if (objKv) {
          sawObject = true;
          const obj: Record<string, string> = {
            [objKv[1]]: stripQuotes(objKv[2]),
          };
          const dashIndent = ind;
          i++;
          // Sibling fields of this object are indented past the dash.
          while (i < fm.length && fm[i].trim() !== "" && indentOf(fm[i]) > dashIndent) {
            const pair = fm[i].match(/^\s*([A-Za-z0-9_-]+):\s*(.*)$/);
            if (pair) obj[pair[1]] = stripQuotes(pair[2]);
            i++;
          }
          objs.push(obj);
          continue;
        }
        items.push(stripQuotes(rest));
        i++;
        continue;
      }
      break;
    }
    data[key] = sawObject ? objs : items;
  }

  return { data, body };
}

// ── frontmatter → typed conversation ────────────────────────────────────────

function asString(v: FmValue | undefined): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function asStringArray(v: FmValue | undefined): string[] {
  if (Array.isArray(v)) {
    return v
      .map((x) => (typeof x === "string" ? x : ""))
      .filter((x): x is string => x.length > 0);
  }
  return [];
}

function asObjectArray(v: FmValue | undefined): Array<Record<string, string>> {
  if (Array.isArray(v) && v.length > 0 && typeof v[0] === "object") {
    return v as Array<Record<string, string>>;
  }
  return [];
}

function normalizeDate(raw: string | null): string | null {
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const ddmmyy = raw.match(/^(\d{2})[_/-](\d{2})[_/-](\d{2})$/);
  if (ddmmyy) return `20${ddmmyy[3]}-${ddmmyy[2]}-${ddmmyy[1]}`;
  return raw;
}

const HEADING_RE = /^#{1,6}\s/;

/** Slice the lines under a markdown heading until the next stop heading / EOF. */
function extractSection(
  body: string,
  startRe: RegExp,
  endRes: RegExp[],
): string | null {
  const lines = body.split("\n");
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (startRe.test(lines[i])) {
      start = i + 1;
      break;
    }
  }
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    if (endRes.some((re) => re.test(lines[i]))) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n").trim();
}

function parseBullets(section: string | null): string[] {
  if (!section) return [];
  return section
    .split("\n")
    .map((l) => l.replace(/^\s*[-*]\s+/, "").trim())
    .filter((l) => l.length > 0 && !/^n\/?a\.?$/i.test(l));
}

function cleanSummary(section: string | null): string {
  if (!section) return "";
  return section
    .split("\n")
    .map((l) => l.replace(/^\s*[-*]\s+/, "").trim())
    .filter(Boolean)
    .join("\n");
}

/** The fields the routing engine matches on, built from a parsed conversation. */
function buildRoutingItem(conv: IngestConversation): RoutingItem {
  return {
    company: conv.company ?? "",
    calendarTitle: conv.calendarTitle ?? conv.title,
    title: conv.title,
    meetingId: conv.meetingId ?? "",
    participantEmails: conv.participants
      .map((p) => p.email ?? "")
      .filter(Boolean),
    participantNames: conv.participants.map((p) => p.name),
  };
}

function conversationFromMarkdown(
  repo: string,
  path: string,
  rawMd: string,
  unread: boolean,
): IngestConversation {
  const { data, body } = parseFrontmatter(rawMd);
  const fallback = summaryFromConversationPath(repo, path, new Set());

  const participants: IngestParticipant[] = asObjectArray(data.participants).map(
    (p) => ({
      name: p.name ?? p.email ?? "Unknown",
      email: p.email,
      jobTitle: p.jobTitle ?? p.title ?? p.role,
      company: p.company,
    }),
  );

  // Pipeline body format: `### Key Points`, `### Action Items`, `## Transcript`
  // … then a `# Recording Download Link` footer we drop.
  const keyPoints = extractSection(
    body,
    /^#{1,6}\s*(key points|summary)\b/i,
    [HEADING_RE],
  );
  const actionSection = extractSection(
    body,
    /^#{1,6}\s*action items\b/i,
    [HEADING_RE],
  );
  const transcriptSection = extractSection(
    body,
    /^#{1,6}\s*transcript\b/i,
    [/^#{1,6}\s*recording(\s+download)?\b/i],
  );

  const bodyActions = parseBullets(actionSection).map((text) => ({ text }));
  const fmActions = asObjectArray(data.actions).map((a) => ({
    text: a.text ?? a.action ?? "",
    owner: a.owner,
    due: a.due,
  }));
  const actions: IngestAction[] = (
    bodyActions.length ? bodyActions : fmActions
  ).filter((a) => a.text);

  const deals: IngestDeal[] = asObjectArray(data.deals).map((d) => ({
    name: d.name ?? "",
    stage: d.stage,
  }));

  const durationRaw = asString(data.duration);
  const durationMinutes = durationRaw ? Number.parseInt(durationRaw, 10) : null;
  const calendarTitle = asString(data.calendar_title) ?? undefined;
  const transcript = (transcriptSection ?? body)
    .replace(/^#{1,6}\s*transcript\s*\d*\s*$/gim, "")
    .trim();

  return {
    id: ingestItemId(repo, path),
    repo,
    path,
    channel: asString(data.source) ?? asString(data.channel) ?? "krisp",
    title: asString(data.title) ?? calendarTitle ?? fallback.title,
    date: normalizeDate(asString(data.date)) ?? fallback.date,
    time: asString(data.time),
    durationMinutes: Number.isFinite(durationMinutes) ? durationMinutes : null,
    company: asString(data.company),
    participants,
    streams: asStringArray(data.streams),
    deals,
    summary: cleanSummary(keyPoints) || asString(data.summary) || "",
    actions,
    transcript,
    unread,
    defaultStream:
      asStringArray(data.streams)[0] ?? defaultStreamForRepo(repo),
    meetingId: asString(data.meeting_id) ?? undefined,
    calendarTitle,
    slug: asString(data.slug) ?? undefined,
  };
}

export async function getIngestConversation(
  userId: string,
  repo: string,
  path: string,
): Promise<IngestConversation | null> {
  const readSet = await getIngestReadSet(userId);
  const unread = !readSet.has(ingestItemId(repo, path));
  try {
    const { content } = await getRepoFile(repo, path);
    const conv = conversationFromMarkdown(repo, path, content, unread);
    // Pending (staged) items carry a proposed route for the approve/correct gate.
    if (repo === INGEST_REPO && path.startsWith(INCOMING_DIR)) {
      const config = await loadRoutingConfig();
      const { slug } = proposeSlug(buildRoutingItem(conv), config);
      conv.pending = true;
      conv.proposedSlug = slug;
      conv.proposedRoute = routePathForSlug(slug, config) ?? undefined;
    }
    return conv;
  } catch {
    return null;
  }
}

/**
 * Pending inbox: staged Krisp meetings in context-ingest/incoming awaiting
 * approval. Each carries a deterministic proposed slug → destination. Reads
 * frontmatter per file (small N) since the proposal needs participants/company.
 */
export async function listPendingIngest(
  userId: string,
): Promise<IngestItemSummary[]> {
  const readSet = await getIngestReadSet(userId);
  let paths: string[] = [];
  try {
    ({ paths } = await getRepoTree(INGEST_REPO));
  } catch {
    return [];
  }
  const incoming = paths
    .filter((p) => p.startsWith(INCOMING_DIR) && p.toLowerCase().endsWith(".md"))
    .slice(0, MAX_PER_SECTION);
  if (incoming.length === 0) return [];

  const config = await loadRoutingConfig();
  const items = await Promise.all(
    incoming.map(async (path): Promise<IngestItemSummary | null> => {
      try {
        const { content } = await getRepoFile(INGEST_REPO, path);
        const id = ingestItemId(INGEST_REPO, path);
        const conv = conversationFromMarkdown(
          INGEST_REPO,
          path,
          content,
          !readSet.has(id),
        );
        const { slug } = proposeSlug(buildRoutingItem(conv), config);
        return {
          id,
          section: "conversations",
          repo: INGEST_REPO,
          path,
          channel: conv.channel,
          title: conv.title,
          participantsLabel: conv.participants.map((p) => p.name).join(", "),
          date: conv.date,
          unread: conv.unread,
          pending: true,
          proposedSlug: slug,
          proposedRoute: routePathForSlug(slug, config) ?? undefined,
        };
      } catch {
        return null;
      }
    }),
  );
  return items
    .filter((x): x is IngestItemSummary => x !== null)
    .sort(byDateDesc);
}

const SCHEMA_REPO = "juliantedstone/context-schema";
const RULES_PATH = "routing/rules.yaml";

/** "context-message-coh/conversations" → { repo, dir }. Owner is fixed. */
function splitRoutePath(routePath: string): { repo: string; dir: string } {
  const [first, ...rest] = routePath.split("/");
  return { repo: `juliantedstone/${first}`, dir: rest.join("/") };
}

function setFrontmatterSlug(content: string, slug: string): string {
  if (/^slug:.*$/m.test(content)) {
    return content.replace(/^slug:.*$/m, `slug: ${slug}`);
  }
  const closing = content.indexOf("\n---", 4);
  if (content.startsWith("---\n") && closing !== -1) {
    return `${content.slice(0, closing)}\nslug: ${slug}${content.slice(closing)}`;
  }
  return content;
}

export interface RouteResult {
  ok: boolean;
  destination?: string;
  error?: string;
}

/**
 * Approve/correct gate: move a staged item from context-ingest/incoming into the
 * destination scope repo for `slug`, then (optionally) learn a correction rule so
 * the signal auto-routes next time. Destination write happens BEFORE staging
 * delete, so a failure never loses the file.
 */
export async function routeIngestItem(opts: {
  userId: string;
  path: string;
  slug: string;
  correction?: { field: RoutingField; op: RoutingOp; value: string };
}): Promise<RouteResult> {
  const config = await loadRoutingConfig();
  const routePath = routePathForSlug(opts.slug, config);
  if (!routePath) {
    return { ok: false, error: `No destination configured for slug "${opts.slug}"` };
  }

  let staged: { content: string; sha: string };
  try {
    staged = await getRepoFile(INGEST_REPO, opts.path);
  } catch {
    return { ok: false, error: "Staged file not found" };
  }

  const conv = conversationFromMarkdown(INGEST_REPO, opts.path, staged.content, false);
  const { repo: destRepo, dir } = splitRoutePath(routePath);
  const filename = buildConversationFilename({
    slug: opts.slug,
    calendarTitle: conv.calendarTitle ?? conv.title,
    date: conv.date ?? "0000-00-00",
    participants: conv.participants,
  });
  const destPath = dir ? `${dir}/${filename}` : filename;
  const content = setFrontmatterSlug(staged.content, opts.slug);

  try {
    await putRepoFile({
      fullName: destRepo,
      path: destPath,
      content,
      message: `ingest: route "${conv.title}" → ${opts.slug} (approved in nozero)`,
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Route write failed",
    };
  }

  try {
    await deleteRepoFile({
      fullName: INGEST_REPO,
      path: opts.path,
      sha: staged.sha,
      message: `ingest: routed ${filename}`,
    });
  } catch {
    // Non-fatal: the destination already has the file; staging cleanup retries.
  }

  if (opts.correction) {
    try {
      const rules = await getRepoFile(SCHEMA_REPO, RULES_PATH);
      const updated = appendCorrection(rules.content, {
        id: `ovr-${opts.slug}-${slugifyText(opts.correction.value).slice(0, 24)}`,
        slug: opts.slug,
        field: opts.correction.field,
        op: opts.correction.op,
        value: opts.correction.value,
      });
      if (updated) {
        await putRepoFile({
          fullName: SCHEMA_REPO,
          path: RULES_PATH,
          content: updated,
          sha: rules.sha,
          message: `routing: learn ${opts.correction.field} ${opts.correction.op} "${opts.correction.value}" → ${opts.slug}`,
        });
      }
    } catch {
      // Correction learning is best-effort — the move already succeeded.
    }
  }

  try {
    await setIngestRead(opts.userId, ingestItemId(INGEST_REPO, opts.path), true);
  } catch {
    // read-state is cosmetic
  }

  return { ok: true, destination: `${destRepo}/${destPath}` };
}

// Exposed for unit verification.
export const __test = {
  parseFrontmatter,
  conversationFromMarkdown,
  buildRoutingItem,
};
