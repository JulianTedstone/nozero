import "server-only";

/**
 * camouflex client — the self-hosted Playwright (headless + stealth) submission
 * worker on jupiter. Given a role's form-spec, it fills + submits the ATS form,
 * tiered by worker_order (ats_template → generic_playwright → novel_human); a
 * novel/low-confidence form returns `needs-human`.
 *
 * Fail-safe — DO NOT WEAKEN: never throws to the pipeline. An unconfigured /
 * unreachable worker resolves to `failed` (the submit stage treats that as
 * retryable, leaving the ticket at `ready`).
 *
 * PENDING: the camouflex service itself is jupiter infra not yet stood up
 * (tracked as its own npt-madrigal ticket — analogous to the studio runner #110
 * and hermes-webui). Until configured, submitApplication no-ops fail-safe.
 */

const CAMOUFLEX_URL =
  process.env.NOZERO_CAMOUFLEX_API_URL?.replace(/\/$/, "") ?? "";

export type SubmitStatus = "submitted" | "needs-human" | "failed";

export interface SubmitResult {
  confirmation?: string;
  evidence?: string[];
  reason?: string;
  status: SubmitStatus;
}

export function camouflexConfigured(): boolean {
  return Boolean(CAMOUFLEX_URL);
}

export async function submitApplication(input: {
  roleUid: string;
  formSpecYaml: string;
  workerOrder: string[];
  dryRun: boolean;
}): Promise<SubmitResult> {
  if (!camouflexConfigured()) {
    return { reason: "camouflex not configured", status: "failed" };
  }
  const key = process.env.NOZERO_CAMOUFLEX_API_KEY;
  try {
    const res = await fetch(`${CAMOUFLEX_URL}/submit`, {
      body: JSON.stringify({
        dry_run: input.dryRun,
        form_spec: input.formSpecYaml,
        role_uid: input.roleUid,
        worker_order: input.workerOrder,
      }),
      headers: {
        "Content-Type": "application/json",
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      method: "POST",
      signal: AbortSignal.timeout(300_000),
    });
    const data = (await res.json().catch(() => ({}))) as {
      status?: string;
      confirmation?: string;
      evidence?: string[];
      error?: string;
    };
    if (
      data.status === "submitted" ||
      data.status === "needs-human" ||
      data.status === "failed"
    ) {
      return {
        confirmation: data.confirmation,
        evidence: data.evidence ?? [],
        reason: data.error,
        status: data.status,
      };
    }
    return { reason: data.error ?? `http ${res.status}`, status: "failed" };
  } catch {
    return { reason: "camouflex unreachable", status: "failed" };
  }
}
