import "server-only";

import { getRepoFile } from "@/lib/github-content";
import { hermesChat } from "@/lib/hermes-client";
import { upsertContextFile } from "@/lib/madrigal/context-writer";
import { getIdMap, upsertIdMap } from "@/lib/madrigal/id-map";

const MADRIGAL_REPO = "juliantedstone/context-message-madrigal";

export type ScoreOutcome =
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
 * Score stage — synchronous. Loads the role's research.md, asks hermes for a
 * rubric-weighted fit score as strict JSON in one chat turn, then writes
 * fit_score to the id-map + a score note to context.
 */
export async function runScore(roleUid: string): Promise<ScoreOutcome> {
  const row = await getIdMap(roleUid);
  if (!row) {
    return { reason: "unknown role", status: "skipped" };
  }
  const dir = row.contextPath ?? "";

  let research = "";
  try {
    research = (await getRepoFile(MADRIGAL_REPO, `${dir}/research.md`)).content;
  } catch {
    // No research yet — score on the role alone (degraded).
  }

  const answer = await hermesChat({
    instructions: SCORE_INSTRUCTIONS,
    message: buildScoreTask({
      company: row.companySlug ?? "",
      research,
      title: row.title ?? "",
    }),
  });
  if (!answer) {
    return { reason: "hermes unavailable", status: "skipped" };
  }
  const parsed = parseScore(answer);
  if (!parsed) {
    return { status: "failed" };
  }

  await upsertIdMap({ fitScore: parsed.fitScore, roleUid });
  if (dir) {
    await upsertContextFile(
      `${dir}/score.md`,
      `---\nrole_uid: ${roleUid}\nkind: score\nfit_score: ${parsed.fitScore}\n---\n\n${parsed.rationale}\n`,
      `madrigal: score ${roleUid} = ${parsed.fitScore}`
    );
  }
  return { fitScore: parsed.fitScore, status: "done" };
}
