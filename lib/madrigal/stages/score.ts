import "server-only";

import { getRepoFile } from "@/lib/github-content";
import { getHermesRun, submitHermesRun } from "@/lib/hermes-client";
import { upsertContextFile } from "@/lib/madrigal/context-writer";
import { getIdMap, upsertIdMap } from "@/lib/madrigal/id-map";

const MADRIGAL_REPO = "juliantedstone/context-message-madrigal";

export type ScoreOutcome =
  | { status: "submitted"; runId: string }
  | { status: "running"; runId: string }
  | { fitScore: number; status: "done" }
  | { status: "failed" }
  | { reason: string; status: "skipped" };

const SCORE_INSTRUCTIONS =
  'You assess hiring fit for Julian Tedstone, a senior product/technology leader. Weigh: skills match (0.30), seniority fit (0.15), domain relevance (0.15), mission fit (0.15), compensation (0.15), ways of working (0.10). Return STRICT JSON only — {"fit_score": <integer 0-100>, "rationale": "<2-4 sentences>"} — and nothing else.';

function buildScoreTask(input: {
  company: string;
  research: string;
  title: string;
}): string {
  return [
    `Role: ${input.title}`,
    `Company: ${input.company}`,
    "",
    "Employer + role research:",
    input.research || "(no research available)",
    "",
    'Score the fit and return strict JSON: {"fit_score": N, "rationale": "..."}.',
  ].join("\n");
}

function parseScore(
  output: string
): { fitScore: number; rationale: string } | null {
  try {
    const match = output.match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }
    const obj = JSON.parse(match[0]) as {
      fit_score?: unknown;
      rationale?: unknown;
    };
    const value =
      typeof obj.fit_score === "number" ? obj.fit_score : Number(obj.fit_score);
    if (!Number.isFinite(value)) {
      return null;
    }
    return {
      fitScore: Math.round(value),
      rationale: String(obj.rationale ?? ""),
    };
  } catch {
    return null;
  }
}

/**
 * Score stage — re-entrant (same submit→poll pattern as research). Loads the
 * role's research.md, asks hermes for a rubric-weighted fit score as strict
 * JSON, then writes fit_score to the id-map + a score note to context. The
 * caller re-invokes until `done`/`failed`.
 */
export async function runScore(roleUid: string): Promise<ScoreOutcome> {
  const row = await getIdMap(roleUid);
  if (!row) {
    return { reason: "unknown role", status: "skipped" };
  }
  const meta = row.meta as { scoreRunId?: string };
  const dir = row.contextPath ?? "";

  if (!meta.scoreRunId) {
    let research = "";
    try {
      research = (await getRepoFile(MADRIGAL_REPO, `${dir}/research.md`))
        .content;
    } catch {
      // No research yet — score on the role alone (degraded).
    }
    const runId = await submitHermesRun({
      instructions: SCORE_INSTRUCTIONS,
      task: buildScoreTask({
        company: row.companySlug ?? "",
        research,
        title: row.title ?? "",
      }),
    });
    if (!runId) {
      return { reason: "hermes unavailable", status: "skipped" };
    }
    await upsertIdMap({ meta: { ...row.meta, scoreRunId: runId }, roleUid });
    return { runId, status: "submitted" };
  }

  const run = await getHermesRun(meta.scoreRunId);
  if (!run) {
    return { runId: meta.scoreRunId, status: "running" };
  }
  if (run.status === "completed" && run.output) {
    const parsed = parseScore(run.output);
    await upsertIdMap({
      fitScore: parsed?.fitScore ?? null,
      meta: { ...row.meta, scoreRunId: undefined },
      roleUid,
    });
    if (parsed && dir) {
      await upsertContextFile(
        `${dir}/score.md`,
        `---\nrole_uid: ${roleUid}\nkind: score\nfit_score: ${parsed.fitScore}\n---\n\n${parsed.rationale}\n`,
        `madrigal: score ${roleUid} = ${parsed.fitScore}`
      );
    }
    return parsed
      ? { fitScore: parsed.fitScore, status: "done" }
      : { status: "failed" };
  }
  if (run.status === "failed" || run.status === "cancelled") {
    await upsertIdMap({
      meta: { ...row.meta, scoreRunId: undefined },
      roleUid,
    });
    return { status: "failed" };
  }
  return { runId: meta.scoreRunId, status: "running" };
}
