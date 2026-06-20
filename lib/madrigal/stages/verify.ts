import "server-only";

import { loadMadrigalConfig } from "@/lib/madrigal/config";
import { getIdMap, setState } from "@/lib/madrigal/id-map";

export type VerifyOutcome =
  | { status: "done" }
  | { status: "pending" }
  | { status: "needs-human" }
  | { reason: string; status: "skipped" };

/**
 * Verify stage — `submitting` -> `applied` | `needs-human`. Confirms the
 * application landed by looking for the acknowledgement email captured against
 * the role (meta.ackEmail) within the monitor window.
 *
 * Re-entrant: returns `pending` until the ack arrives; if the window
 * (config.submission.ackMonitorWindowHours) elapses with no ack, diverts to
 * `needs-human` for a manual check.
 *
 * SEAM: the actual ack capture — IMAP IDLE on julian@nopilot.co (MXroute),
 * matching `ack_match` — is an inbound ingestor (a listener / Ground Crew worker)
 * that writes meta.ackEmail. This stage consumes that signal; it does not poll
 * IMAP itself.
 */
export async function runVerify(roleUid: string): Promise<VerifyOutcome> {
  const row = await getIdMap(roleUid);
  if (!row) {
    return { reason: "unknown role", status: "skipped" };
  }
  const meta = row.meta as { submittedAt?: string; ackEmail?: unknown };

  if (meta.ackEmail) {
    await setState(roleUid, "applied", "nozero", "submitting", {
      ackEmail: meta.ackEmail,
    });
    return { status: "done" };
  }

  if (!meta.submittedAt) {
    return { status: "pending" };
  }

  const config = await loadMadrigalConfig();
  const submittedMs = Date.parse(meta.submittedAt);
  const elapsedH = (Date.now() - submittedMs) / 3_600_000;
  if (
    Number.isFinite(submittedMs) &&
    elapsedH > config.submission.ackMonitorWindowHours
  ) {
    await setState(roleUid, "needs-human", "nozero", "submitting", {
      reason: `no ack within ${config.submission.ackMonitorWindowHours}h`,
    });
    return { status: "needs-human" };
  }
  return { status: "pending" };
}
