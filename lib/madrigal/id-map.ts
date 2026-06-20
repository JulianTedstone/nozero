import "server-only";

import { createClient } from "@supabase/supabase-js";
import type {
  EventEnvelope,
  IdMapRow,
  MadrigalState,
} from "@/lib/madrigal/types";

// madrigal lives in its own Postgres schema. The shared admin client is generic-
// typed to the generated `nozero` schema, so `.schema("madrigal")` on it is a type
// error — use a dedicated, schema-scoped service-role client instead.
function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      db: { schema: "madrigal" },
    }
  );
}

type IdMapDbRow = {
  role_uid: string;
  title: string | null;
  company_slug: string | null;
  state: string;
  fit_score: number | null;
  github_issue: string | null;
  flightdeck_item: string | null;
  twenty_opportunity: string | null;
  twenty_company: string | null;
  twenty_people: string[];
  context_path: string | null;
  company_path: string | null;
  docket_gallery_code: string | null;
  docket_assets: string[];
  gmail_thread: string | null;
  calendar_events: string[];
  meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

const COLUMN_MAP: Record<string, string> = {
  title: "title",
  companySlug: "company_slug",
  state: "state",
  fitScore: "fit_score",
  githubIssue: "github_issue",
  flightdeckItem: "flightdeck_item",
  twentyOpportunity: "twenty_opportunity",
  twentyCompany: "twenty_company",
  twentyPeople: "twenty_people",
  contextPath: "context_path",
  companyPath: "company_path",
  docketGalleryCode: "docket_gallery_code",
  docketAssets: "docket_assets",
  gmailThread: "gmail_thread",
  calendarEvents: "calendar_events",
  meta: "meta",
};

function toRow(r: IdMapDbRow): IdMapRow {
  return {
    roleUid: r.role_uid,
    title: r.title,
    companySlug: r.company_slug,
    state: r.state as MadrigalState,
    fitScore: r.fit_score,
    githubIssue: r.github_issue,
    flightdeckItem: r.flightdeck_item,
    twentyOpportunity: r.twenty_opportunity,
    twentyCompany: r.twenty_company,
    twentyPeople: r.twenty_people ?? [],
    contextPath: r.context_path,
    companyPath: r.company_path,
    docketGalleryCode: r.docket_gallery_code,
    docketAssets: r.docket_assets ?? [],
    gmailThread: r.gmail_thread,
    calendarEvents: r.calendar_events ?? [],
    meta: r.meta ?? {},
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function getIdMap(roleUid: string): Promise<IdMapRow | null> {
  const { data, error } = await db()
    .from("id_map")
    .select("*")
    .eq("role_uid", roleUid)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data ? toRow(data as unknown as IdMapDbRow) : null;
}

/** Upsert a partial id_map row (only provided keys are written). */
export async function upsertIdMap(
  patch: Partial<IdMapRow> & { roleUid: string }
): Promise<void> {
  const row: Record<string, unknown> = { role_uid: patch.roleUid };
  for (const [camel, snake] of Object.entries(COLUMN_MAP)) {
    const value = (patch as Record<string, unknown>)[camel];
    if (value !== undefined) {
      row[snake] = value;
    }
  }
  const { error } = await db()
    .from("id_map")
    .upsert(row as never, { onConflict: "role_uid" });
  if (error) {
    throw error;
  }
}

/** Append one transition to the event log. */
export async function logEvent(env: EventEnvelope): Promise<void> {
  const { error } = await db()
    .from("events")
    .insert({
      role_uid: env.role_uid,
      from_state: env.from_state,
      to_state: env.to_state,
      actor: env.actor,
      payload: env.payload,
    } as never);
  if (error) {
    throw error;
  }
}

/** Advance state on id_map AND append the matching event — one transition. */
export async function setState(
  roleUid: string,
  to: MadrigalState,
  actor: string,
  from: MadrigalState | null = null,
  payload: Record<string, unknown> = {}
): Promise<void> {
  await upsertIdMap({ roleUid, state: to });
  await logEvent({
    role_uid: roleUid,
    from_state: from,
    to_state: to,
    actor,
    ts: new Date().toISOString(),
    payload,
  });
}
