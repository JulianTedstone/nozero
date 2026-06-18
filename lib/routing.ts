import "server-only";

import { getRepoFile } from "@/lib/github-content";

/**
 * Deterministic routing for the context ingest gate.
 *
 * Rules live in `juliantedstone/context-schema/routing/rules.yaml` — the single
 * source of truth shared with context-ingest/pipeline.py. Rules are evaluated
 * top-to-bottom, FIRST MATCH WINS. nozero prepends learned corrections above the
 * seed rules (so a correction always beats a seed rule), and the pipeline stages
 * only — nozero owns the approve/correct → move.
 */

const RULES_REPO = "juliantedstone/context-schema";
const RULES_PATH = "routing/rules.yaml";

export type RoutingField =
  | "company"
  | "participant_email"
  | "participant_name"
  | "calendar_title"
  | "title"
  | "meeting_id";

export type RoutingOp = "contains" | "equals";

export interface RoutingRule {
  id: string;
  slug: string;
  field: RoutingField;
  op: RoutingOp;
  value: string;
}

export interface RoutingConfig {
  defaultSlug: string;
  rules: RoutingRule[];
  routes: Record<string, string>;
  raw: string; // verbatim file content (for correction round-trips)
}

export interface RoutingItem {
  company: string;
  calendarTitle: string;
  title: string;
  meetingId: string;
  participantEmails: string[];
  participantNames: string[];
}

const FALLBACK: RoutingConfig = {
  defaultSlug: "coh",
  rules: [],
  routes: {},
  raw: "",
};

function stripQuotes(v: string): string {
  const t = v.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

/** Parse the flat flow-style rules.yaml (no nested structures — one rule per line). */
export function parseRoutingRules(content: string): RoutingConfig {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  let defaultSlug = "coh";
  const rules: RoutingRule[] = [];
  const routes: Record<string, string> = {};
  let inRoutes = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const def = trimmed.match(/^default_slug:\s*(.+)$/);
    if (def) {
      defaultSlug = stripQuotes(def[1]);
      continue;
    }

    if (/^routes:\s*$/.test(trimmed)) {
      inRoutes = true;
      continue;
    }

    const ruleMatch = trimmed.match(/^-\s*\{(.+)\}\s*$/);
    if (ruleMatch) {
      inRoutes = false;
      const fields: Record<string, string> = {};
      const pairRe = /([A-Za-z_]+)\s*:\s*("(?:[^"]*)"|'(?:[^']*)'|[^,}]+)/g;
      let m: RegExpExecArray | null;
      // biome-ignore lint/suspicious/noAssignInExpressions: standard regex exec loop
      while ((m = pairRe.exec(ruleMatch[1])) !== null) {
        fields[m[1]] = stripQuotes(m[2]);
      }
      if (fields.id && fields.slug && fields.field && fields.op && fields.value) {
        rules.push({
          id: fields.id,
          slug: fields.slug,
          field: fields.field as RoutingField,
          op: fields.op as RoutingOp,
          value: fields.value,
        });
      }
      continue;
    }

    if (inRoutes && line.startsWith("  ")) {
      const kv = trimmed.match(/^("[^"]*"|'[^']*'|[^:]+):\s*(.+)$/);
      if (kv) {
        routes[stripQuotes(kv[1])] = stripQuotes(kv[2]);
      }
      continue;
    }

    // any other top-level key ends a routes block
    if (!line.startsWith(" ")) inRoutes = false;
  }

  return { defaultSlug, rules, routes, raw: content };
}

function fieldValues(item: RoutingItem, field: RoutingField): string[] {
  switch (field) {
    case "company":
      return [item.company];
    case "participant_email":
      return item.participantEmails;
    case "participant_name":
      return item.participantNames;
    case "calendar_title":
      return [item.calendarTitle];
    case "title":
      return [item.title];
    case "meeting_id":
      return [item.meetingId];
  }
}

function ruleMatches(rule: RoutingRule, item: RoutingItem): boolean {
  const needle = rule.value.toLowerCase();
  return fieldValues(item, rule.field).some((raw) => {
    const hay = (raw ?? "").toLowerCase();
    return rule.op === "equals" ? hay === needle : hay.includes(needle);
  });
}

/** First-match-wins slug for an item. Deterministic. */
export function proposeSlug(
  item: RoutingItem,
  config: RoutingConfig,
): { slug: string; ruleId: string } {
  for (const rule of config.rules) {
    if (ruleMatches(rule, item)) {
      return { slug: rule.slug, ruleId: rule.id };
    }
  }
  return { slug: config.defaultSlug, ruleId: "default" };
}

export function routePathForSlug(
  slug: string,
  config: RoutingConfig,
): string | null {
  return config.routes[slug] ?? null;
}

export async function loadRoutingConfig(): Promise<RoutingConfig> {
  try {
    const { content } = await getRepoFile(RULES_REPO, RULES_PATH);
    return parseRoutingRules(content);
  } catch {
    return FALLBACK;
  }
}

/** Insert a learned correction as the highest-priority rule (top of `rules:`). */
export function appendCorrection(
  raw: string,
  rule: RoutingRule,
): string | null {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  const idx = lines.findIndex((l) => /^rules:\s*$/.test(l.trim()));
  if (idx === -1) return null;
  const line = `  - { id: ${rule.id}, slug: "${rule.slug}", field: ${rule.field}, op: ${rule.op}, value: "${rule.value}" }`;
  lines.splice(idx + 1, 0, line);
  return lines.join("\n");
}

// ── filename builder (ports context-ingest/pipeline.py build_filename) ───────

const INTERNAL_DOMAINS = ["coherence.digital", "cohaesus.co.uk", "group.cohaesus"];

export function slugifyText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 55);
}

export function buildConversationFilename(input: {
  slug: string;
  calendarTitle: string;
  date: string;
  participants: Array<{ name?: string; email?: string }>;
}): string {
  const calTitle = slugifyText(input.calendarTitle || "unknown");
  const date = input.date || "0000-00-00";
  const external = input.participants.filter((p) => {
    const email = (p.email ?? "").toLowerCase();
    const isInternal = INTERNAL_DOMAINS.some((d) => email.includes(d));
    return !isInternal && p.name && p.name !== "Julian Tedstone";
  });
  const keyNames = external
    .slice(0, 2)
    .map((p) => slugifyText((p.name ?? "").split(/\s+/).pop() ?? ""))
    .filter(Boolean)
    .join("-");
  return keyNames
    ? `conversation-${input.slug}-${calTitle}-${keyNames}-${date}.md`
    : `conversation-${input.slug}-${calTitle}-${date}.md`;
}
