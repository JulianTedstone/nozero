import "server-only";

/**
 * Fail-safe, deferred mirror of a madrigal opportunity into Twenty (the SoR).
 * Mirrors the contract in lib/crm-mirror.ts — DO NOT WEAKEN:
 *   1. Never blocks the pipeline. The local madrigal.id_map row is the durable
 *      write; the Twenty push is a best-effort, time-bounded refresh on top.
 *   2. On link-down the row keeps its last-known twenty_* ids and is re-synced
 *      opportunistically later. Nothing destructive on either side.
 *   3. This function never throws to its caller — a failed push is recorded and
 *      retried by the reconciler.
 *
 * STUB: wire to lib/hydration-client.ts (the aqua/Twenty link — soma-client is
 * deprecated) once the opportunity object + Twenty opportunity schema are
 * finalised (Flightdeck npt-aqua #85 — Twenty live sync).
 */
export interface OpportunityDraft {
  companySlug: string;
  roleUid: string;
  stage: string; // mirrors the madrigal state -> Twenty opportunity stage
  title: string;
}

export async function mirrorOpportunity(
  draft: OpportunityDraft
): Promise<{ pushed: boolean; roleUid: string }> {
  // 1) LOCAL-FIRST: the id_map row is authoritative and already written by the caller.
  // 2) BEST-EFFORT: attempt the Twenty upsert via the aqua link (graceful null on down),
  //    then upsertIdMap({ roleUid, twentyOpportunity, twentyCompany, ... }) on success.
  // 3) On failure: leave a pending marker for the reconciler. Never throw.
  return { pushed: false, roleUid: draft.roleUid };
}
