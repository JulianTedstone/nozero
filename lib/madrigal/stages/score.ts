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
  if (!output) {
    return null;
  }
  // Strip markdown fences so ```json blocks / prose-wrapped output parse cleanly.
  const cleaned = output.replace(/```(?:json)?/gi, " ");
  // Try each balanced {...} candidate plus the greedy whole-span; prefer one
  // carrying a finite fit_score (LLMs routinely wrap the JSON in prose).
  const candidates = [...(cleaned.match(/\{[^{}]*\}/g) ?? [])];
  const greedy = cleaned.match(/\{[\s\S]*\}/);
  if (greedy) {
    candidates.push(greedy[0]);
  }
  for (const candidate of candidates) {
    try {
      const obj = JSON.parse(candidate) as {
        fit_score?: unknown;
        rationale?: unknown;
      };
      const value =
        typeof obj.fit_score === "number"
          ? obj.fit_score
          : Number(obj.fit_score);
      if (Number.isFinite(value)) {
        return {
          fitScore: Math.round(value),
          rationale: String(obj.rationale ?? ""),
        };
      }
    } catch {
      // not valid JSON — try the next candidate
    }
  }
  // Last resort: pull a fit_score out of prose ("fit_score: 75", "fit score = 80").
  const scoreMatch = cleaned.match(/fit[_\s-]?score["']?\s*[:=]\s*(\d{1,3})/i);
  if (scoreMatch) {
    const value = Number(scoreMatch[1]);
    if (Number.isFinite(value)) {
      const rationaleMatch = cleaned.match(
        /rationale["']?\s*[:=]\s*["']?([^"'\n}]{0,400})/i
      );
      return {
        fitScore: Math.round(value),
        rationale: rationaleMatch ? rationaleMatch[1].trim() : "",
      };
    }
  }
  return null;
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

  const task = buildScoreTask({
    company: row.companySlug ?? "",
    research,
    title: row.title ?? "",
  });
  let answer = await hermesChat({
    instructions: SCORE_INSTRUCTIONS,
    message: task,
  });
  if (!answer) {
    return { reason: "hermes unavailable", status: "skipped" };
  }
  let parsed = parseScore(answer);
  if (!parsed) {
    // One stricter re-ask — JSON only, no prose/fences — before giving up.
    answer = await hermesChat({
      instructions: SCORE_INSTRUCTIONS,
      message: `${task}\n\nReturn ONLY the JSON object on a single line: {"fit_score": <integer 0-100>, "rationale": "<text>"}. No prose, no code fences, nothing else.`,
    });
    parsed = answer ? parseScore(answer) : null;
  }
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
