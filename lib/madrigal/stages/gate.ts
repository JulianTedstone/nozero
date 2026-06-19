import "server-only";

import { DEFAULT_CONFIG } from "@/lib/madrigal/config";
import { getIdMap, setState, upsertIdMap } from "@/lib/madrigal/id-map";

export type GateOutcome =
  | { decision: "applying"; status: "done" }
  | { decision: "disqualified"; status: "done" }
  | { status: "pending" }
  | { reason: string; status: "skipped" };

/**
 * Gate stage — deterministic. Branches on the fit score vs the configured
 * threshold: at/above → `applying`, below → `disqualified` (reason recorded in
 * meta + the transition event). Returns `pending` if the role isn't scored yet.
 */
export async function runGate(roleUid: string): Promise<GateOutcome> {
  const row = await getIdMap(roleUid);
  if (!row) {
    return { reason: "unknown role", status: "skipped" };
  }
  if (row.fitScore == null) {
    return { status: "pending" };
  }
  const threshold = DEFAULT_CONFIG.gate.threshold;
  if (row.fitScore >= threshold) {
    await setState(roleUid, "applying", "nozero", "researching", {
      fitScore: row.fitScore,
    });
    return { decision: "applying", status: "done" };
  }
  const reason = `fit ${row.fitScore} < threshold ${threshold}`;
  await upsertIdMap({
    meta: { ...row.meta, disqualificationReason: reason },
    roleUid,
  });
  await setState(roleUid, "disqualified", "nozero", "researching", { reason });
  return { decision: "disqualified", status: "done" };
}
