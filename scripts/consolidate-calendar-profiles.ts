#!/usr/bin/env bun
/**
 * One-time merge of Julian's split calendar profiles into juliantedstone@gmail.com,
 * then backfill Google history (25y) and CalDAV sync on the canonical profile.
 *
 * Run: op run --env-file=.env.op -- bun scripts/consolidate-calendar-profiles.ts
 * Dry-run: DRY_RUN=1 op run --env-file=.env.op -- bun scripts/consolidate-calendar-profiles.ts
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { backfillCalendarHistory } from "@/lib/google-accounts-sync";

const CANONICAL_ID = "c3dfbece-afd2-4cf5-8509-e489466038ae";
const CANONICAL_EMAIL = "juliantedstone@gmail.com";
const NOPILOT_ID = "83e85928-dcdd-4843-ab8f-bcae6a5c0c81";
const COHERENCE_ID = "faa79d9f-b9e1-4d7f-990d-d02376d02cae";

const DRY_RUN = process.env.DRY_RUN === "1";
const SKIP_BACKFILL = process.env.SKIP_BACKFILL === "1";
const RECOVER_ONLY = process.env.RECOVER_ONLY === "1";

type ProfileRow = {
  id: string;
  email: string | null;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  google_sync_token: string | null;
  preferences: Record<string, unknown> | null;
};

function log(...args: unknown[]) {
  console.log("[consolidate]", ...args);
}

async function fetchProfile(
  admin: ReturnType<typeof createAdminClient>,
  id: string,
): Promise<ProfileRow | null> {
  const { data, error } = await admin
    .from("profiles")
    .select(
      "id, email, access_token, refresh_token, expires_at, google_sync_token, preferences",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as ProfileRow | null;
}

async function countEvents(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<number> {
  const { count, error } = await admin
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw error;
  return count ?? 0;
}

async function fetchAllEvents(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
) {
  const pageSize = 1000;
  const all: Array<{
    event_id: string;
    start_at: string;
    end_at: string;
    source: string | null;
    data: unknown;
  }> = [];
  let from = 0;

  while (true) {
    const { data, error } = await admin
      .from("events")
      .select("event_id, start_at, end_at, source, data")
      .eq("user_id", userId)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return all;
}

async function migrateEvents(
  admin: ReturnType<typeof createAdminClient>,
  fromUserId: string,
  toUserId: string,
  tagLegacyCoherence = false,
) {
  const rows = await fetchAllEvents(admin, fromUserId);
  const before = rows.length;
  if (before === 0) {
    log(`No events on ${fromUserId}`);
    return 0;
  }

  log(`Migrating ${before} events from ${fromUserId} → ${toUserId}`);

  if (DRY_RUN) return before;

  let moved = 0;
  for (const row of rows) {
    const data = { ...(row.data as Record<string, unknown>) };
    data.userId = toUserId;
    if (
      tagLegacyCoherence &&
      !data.accountEmail &&
      data.source === "google"
    ) {
      data.accountEmail = "julian.tedstone@coherence.digital";
    }

    const { error: upsertError } = await admin.from("events").upsert(
      {
        user_id: toUserId,
        event_id: row.event_id,
        start_at: row.start_at,
        end_at: row.end_at,
        source: row.source ?? (data.source as string) ?? "google",
        data,
      },
      { onConflict: "user_id,event_id" },
    );
    if (upsertError) throw upsertError;
    moved++;
  }

  if (moved !== before) {
    throw new Error(
      `Migration incomplete for ${fromUserId}: upserted ${moved} of ${before}`,
    );
  }

  const { error: deleteError } = await admin
    .from("events")
    .delete()
    .eq("user_id", fromUserId);
  if (deleteError) throw deleteError;

  return moved;
}

async function mergePreferences(
  admin: ReturnType<typeof createAdminClient>,
  canonical: ProfileRow,
  nopilot: ProfileRow,
) {
  const canonPrefs = (canonical.preferences ?? {}) as Record<string, unknown>;
  const nptPrefs = (nopilot.preferences ?? {}) as Record<string, unknown>;

  const connectedTokens = {
    ...((nptPrefs.connectedTokens as Record<string, unknown>) ?? {}),
    ...((canonPrefs.connectedTokens as Record<string, unknown>) ?? {}),
  } as Record<string, Record<string, string>>;

  // Primary login is gmail — drop duplicate connected token for same email.
  delete connectedTokens[CANONICAL_EMAIL.toLowerCase()];
  delete connectedTokens[CANONICAL_EMAIL];

  // Nopilot workspace primary OAuth becomes a connected account on the gmail profile.
  if (nopilot.access_token && nopilot.refresh_token && nopilot.email) {
    connectedTokens[nopilot.email] = {
      ...(connectedTokens[nopilot.email] ?? {}),
      accessToken: nopilot.access_token,
      refreshToken: nopilot.refresh_token,
      tokenExpiry: nopilot.expires_at ?? new Date(Date.now() + 3600_000).toISOString(),
      scope: connectedTokens[nopilot.email]?.scope ?? "calendar",
      googleSyncToken: nopilot.google_sync_token ?? null,
      updatedAt: new Date().toISOString(),
    };
  }

  const connectedAccounts = [
    ...((nptPrefs.connectedAccounts as unknown[]) ?? []),
  ] as Array<Record<string, unknown>>;

  const hasNopilotGoogle = connectedAccounts.some(
    (a) =>
      a.type === "google" &&
      String(a.email).toLowerCase() === String(nopilot.email).toLowerCase(),
  );
  if (!hasNopilotGoogle && nopilot.email) {
    connectedAccounts.unshift({
      id: "acct-nopilot-workspace",
      type: "google",
      email: nopilot.email,
      label: "Google Calendar & Gmail",
      connected: true,
      color: "#22C55E",
    });
  }

  const calendarSubscriptions = {
    ...((nptPrefs.calendarSubscriptions as Record<string, unknown>) ?? {}),
    ...((canonPrefs.calendarSubscriptions as Record<string, unknown>) ?? {}),
  };

  const connectedCalDav = {
    ...((nptPrefs.connectedCalDav as Record<string, unknown>) ?? {}),
    ...((canonPrefs.connectedCalDav as Record<string, unknown>) ?? {}),
  };

  const calendarSyncRange =
    nptPrefs.calendarSyncRange ?? canonPrefs.calendarSyncRange;

  const emailAccounts =
    nptPrefs.emailAccounts ?? canonPrefs.emailAccounts;

  const patch = {
    connectedAccounts,
    connectedTokens,
    calendarSubscriptions,
    connectedCalDav,
    calendarSyncRange,
    emailAccounts,
  };

  log("Preference keys merged:", Object.keys(patch).join(", "));

  if (DRY_RUN) return;

  const { error } = await admin.rpc("patch_profile_preferences", {
    p_user_id: CANONICAL_ID,
    p_patch: patch,
  });
  if (error) throw error;
}

async function main() {
  const admin = createAdminClient();

  const [canonical, nopilot, coherence] = await Promise.all([
    fetchProfile(admin, CANONICAL_ID),
    fetchProfile(admin, NOPILOT_ID),
    fetchProfile(admin, COHERENCE_ID),
  ]);

  if (!canonical || !nopilot) {
    throw new Error("Missing canonical or nopilot profile");
  }

  log("Before counts:");
  log("  canonical:", await countEvents(admin, CANONICAL_ID));
  log("  nopilot:", await countEvents(admin, NOPILOT_ID));
  log("  coherence:", coherence ? await countEvents(admin, COHERENCE_ID) : 0);

  if (RECOVER_ONLY) {
    log("RECOVER_ONLY: skipping preference merge and event migration");
  } else {
    await mergePreferences(admin, canonical, nopilot);

    const movedNpt = await migrateEvents(admin, NOPILOT_ID, CANONICAL_ID);
    const movedCoh = coherence
      ? await migrateEvents(admin, COHERENCE_ID, CANONICAL_ID, true)
      : 0;

    log(`Moved ${movedNpt} + ${movedCoh} events → ${CANONICAL_EMAIL}`);
  }

  if (!DRY_RUN && !SKIP_BACKFILL) {
    // Clear sync tokens so gmail account re-pulls full history on backfill.
    const { data: profile } = await admin
      .from("profiles")
      .select("preferences, google_sync_token")
      .eq("id", CANONICAL_ID)
      .maybeSingle();

    const prefs = (profile?.preferences ?? {}) as Record<string, unknown>;
    const tokens = (prefs.connectedTokens ?? {}) as Record<
      string,
      Record<string, string>
    >;
    for (const email of Object.keys(tokens)) {
      if (tokens[email]) {
        tokens[email].googleSyncToken = null;
      }
    }

    await admin
      .from("profiles")
      .update({ google_sync_token: null })
      .eq("id", CANONICAL_ID);

    await admin.rpc("patch_profile_preferences", {
      p_user_id: CANONICAL_ID,
      p_patch: { connectedTokens: tokens },
    });

    log("Starting 25-year calendar backfill (Google + CalDAV)...");
    const backfill = await backfillCalendarHistory(CANONICAL_ID);
    log("Backfill result:", backfill);
  }

  log("After counts:");
  log("  canonical:", await countEvents(admin, CANONICAL_ID));
  log("  nopilot:", await countEvents(admin, NOPILOT_ID));
  log("  coherence:", coherence ? await countEvents(admin, COHERENCE_ID) : 0);
  log(DRY_RUN ? "Dry run complete." : "Consolidation complete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
