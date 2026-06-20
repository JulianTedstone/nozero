import "server-only";

import { upsertContextFile } from "@/lib/madrigal/context-writer";
import { getIdMap, setState } from "@/lib/madrigal/id-map";
import { mirrorOpportunity } from "@/lib/madrigal/twenty-mirror";

export type FinalizeOutcome =
  | { mirrored: boolean; status: "done" }
  | { reason: string; status: "skipped" };

/**
 * Finalize stage — `applied` -> `following-up`. Registers the opportunity in
 * Twenty (the SoR) via the fail-safe mirror (deferred — never blocks; the
 * reconciler retries) and captures a finalize note to the context vault.
 *
 * SEAM: the gbrain reindex of the updated context is an external ingest of the
 * repo (gbrain indexes the vault separately); this stage writes the durable
 * context, it does not call gbrain directly.
 */
export async function runFinalize(roleUid: string): Promise<FinalizeOutcome> {
  const row = await getIdMap(roleUid);
  if (!row) {
    return { reason: "unknown role", status: "skipped" };
  }

  const mirror = await mirrorOpportunity({
    companySlug: row.companySlug ?? "",
    roleUid,
    stage: "applied",
    title: row.title ?? roleUid,
  });

  const dir = row.contextPath ?? "";
  if (dir) {
    await upsertContextFile(
      `${dir}/finalize.md`,
      `---\nrole_uid: ${roleUid}\nkind: finalize\n---\n\nApplication finalized. Twenty mirror pushed: ${mirror.pushed}.\n`,
      `madrigal: finalize ${roleUid}`
    );
  }

  await setState(roleUid, "following-up", "nozero", "applied", {
    mirrored: mirror.pushed,
  });
  return { mirrored: mirror.pushed, status: "done" };
}
