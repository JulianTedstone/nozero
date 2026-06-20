import "server-only";

import { loadMadrigalConfig } from "@/lib/madrigal/config";
import { upsertContextFile } from "@/lib/madrigal/context-writer";
import { getIdMap, upsertIdMap } from "@/lib/madrigal/id-map";

const DAY_MS = 86_400_000;

export type FollowUpOutcome =
  | { reminders: string[]; status: "done" }
  | { reason: string; status: "skipped" };

/**
 * Follow-up stage — runs in `following-up`. Computes the reminder schedule
 * (config.followUp.cadenceDays from the submission anchor) and persists it to
 * the id-map + context vault. Idempotent / re-entrant; does NOT change state —
 * closing the ticket is an outcome event (`following-up` -> `closed`).
 *
 * SEAM: creating the actual Google Calendar events on julian.nopilot@gmail.com
 * (via lib/calendar.createEvent) is wired once the madrigal calendar identity is
 * bound; until then the schedule is recorded for the diary worker to place.
 */
export async function runFollowUp(roleUid: string): Promise<FollowUpOutcome> {
  const row = await getIdMap(roleUid);
  if (!row) {
    return { reason: "unknown role", status: "skipped" };
  }
  const config = await loadMadrigalConfig();
  const meta = row.meta as { submittedAt?: string };
  const anchor = meta.submittedAt ? Date.parse(meta.submittedAt) : Date.now();
  const base = Number.isFinite(anchor) ? anchor : Date.now();
  const reminders = config.followUp.cadenceDays.map((d) =>
    new Date(base + d * DAY_MS).toISOString().slice(0, 10)
  );

  await upsertIdMap({ meta: { ...row.meta, followUps: reminders }, roleUid });
  const dir = row.contextPath ?? "";
  if (dir) {
    await upsertContextFile(
      `${dir}/follow-up.md`,
      `---\nrole_uid: ${roleUid}\nkind: follow-up\n---\n\nFollow-up reminders (diary): ${reminders.join(", ")}\n`,
      `madrigal: follow-up ${roleUid}`
    );
  }
  return { reminders, status: "done" };
}
