import "server-only";

import { getIdMap } from "@/lib/madrigal/id-map";
import { mirrorOpportunity } from "@/lib/madrigal/twenty-mirror";

/**
 * Reconciler — enforces board ⇄ Twenty 1:1 parity and retries deferred mirror
 * writes. This is NOT a pipeline stage: it's cron-driven, the always-on safety
 * net behind the fail-safe (local-first) Twenty sync. A role whose
 * `twenty_opportunity` is still null has a deferred write the reconciler retries;
 * it never blocks the pipeline.
 *
 * DEPLOY SEAM: a cron / the recommend-and-act scheduler calls runReconcileRole
 * per active role (or a sweep). Wiring the schedule is jupiter infra.
 */
export async function runReconcileRole(
  roleUid: string
): Promise<{ reconciled: boolean; reason?: string }> {
  const row = await getIdMap(roleUid);
  if (!row) {
    return { reason: "unknown role", reconciled: false };
  }
  // Already linked to Twenty — parity holds (state mirroring is the SoR's job).
  if (row.twentyOpportunity) {
    return { reconciled: true };
  }
  // Deferred write outstanding — retry the mirror (fail-safe).
  const mirror = await mirrorOpportunity({
    companySlug: row.companySlug ?? "",
    roleUid,
    stage: row.state,
    title: row.title ?? roleUid,
  });
  return { reconciled: mirror.pushed };
}
