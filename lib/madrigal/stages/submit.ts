import "server-only";

import { getRepoFile } from "@/lib/github-content";
import {
  camouflexConfigured,
  submitApplication,
} from "@/lib/madrigal/camouflex-client";
import { loadMadrigalConfig } from "@/lib/madrigal/config";
import { getIdMap, setState, upsertIdMap } from "@/lib/madrigal/id-map";

const MADRIGAL_REPO = "juliantedstone/context-message-madrigal";

export type SubmitOutcome =
  | { status: "held" }
  | { status: "submitted" }
  | { status: "needs-human" }
  | { reason: string; status: "failed" }
  | { reason: string; status: "skipped" };

/**
 * Submit stage — `ready` -> `submitting` | `needs-human`. Loads the role's
 * form-spec and hands it to the camouflex worker (Playwright stealth on jupiter),
 * tiered by config.submission.workerOrder.
 *
 * HOLD-AT-READY: while config.submission.autoSubmit is false (burn-in), this
 * does NOT submit — it returns `held` and leaves the ticket at `ready` for a
 * human to release. Re-entrant: a transient `failed` leaves the state unchanged
 * so Activepieces retries; a novel form returns `needs-human`.
 */
export async function runSubmit(roleUid: string): Promise<SubmitOutcome> {
  const row = await getIdMap(roleUid);
  if (!row) {
    return { reason: "unknown role", status: "skipped" };
  }
  const config = await loadMadrigalConfig();
  if (!config.submission.autoSubmit) {
    return { status: "held" };
  }
  if (!camouflexConfigured()) {
    return { reason: "camouflex not configured", status: "skipped" };
  }

  const dir = row.contextPath ?? "";
  let formSpecYaml = "";
  try {
    formSpecYaml = (
      await getRepoFile(MADRIGAL_REPO, `${dir}/submission/form-spec.yaml`)
    ).content;
  } catch {
    return { reason: "no form-spec", status: "skipped" };
  }

  const result = await submitApplication({
    dryRun: false,
    formSpecYaml,
    roleUid,
    workerOrder: config.submission.workerOrder,
  });

  if (result.status === "submitted") {
    await upsertIdMap({
      meta: {
        ...row.meta,
        evidence: result.evidence ?? [],
        submittedAt: new Date().toISOString(),
      },
      roleUid,
    });
    await setState(roleUid, "submitting", "camouflex", "ready", {
      confirmation: result.confirmation,
    });
    return { status: "submitted" };
  }
  if (result.status === "needs-human") {
    await setState(roleUid, "needs-human", "camouflex", "ready", {
      reason: result.reason ?? "novel form",
    });
    return { status: "needs-human" };
  }
  // failed: retryable — leave the ticket at `ready`, let the bus re-invoke.
  return { reason: result.reason ?? "submit failed", status: "failed" };
}
