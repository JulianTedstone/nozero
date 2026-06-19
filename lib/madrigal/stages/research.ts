import "server-only";

import { getHermesRun, submitHermesRun } from "@/lib/hermes-client";
import { roleDir, upsertContextFile } from "@/lib/madrigal/context-writer";
import { getIdMap, upsertIdMap } from "@/lib/madrigal/id-map";

export type ResearchOutcome =
  | { status: "submitted"; runId: string }
  | { status: "running"; runId: string }
  | { status: "done" }
  | { status: "failed" }
  | { status: "skipped"; reason: string };

const RESEARCH_INSTRUCTIONS =
  "You are a job-search research analyst for Julian Tedstone. Research the employer and the role from the supplied links and the web. Return concise markdown with these sections: ## Employer summary, ## Role summary, ## Signals (funding/news/stack/culture), ## Fit considerations (for a senior product/technology leader), ## Sources (with URLs). Be factual and cite sources.";

function buildResearchTask(input: {
  applicationUrl: string;
  company: string;
  jdUrl: string;
  title: string;
}): string {
  return [
    `Role: ${input.title}`,
    `Company: ${input.company}`,
    `Job description: ${input.jdUrl}`,
    `Application page: ${input.applicationUrl}`,
    "",
    "Research the employer and this role. Read the JD + application pages and search the web as needed.",
  ].join("\n");
}

function researchDoc(roleUid: string, output: string): string {
  return `---\nrole_uid: ${roleUid}\nkind: research\n---\n\n${output}\n`;
}

/**
 * Research stage — re-entrant. The first call submits a hermes run and stores
 * its run_id in id_map.meta; later calls poll it. When the run completes, the
 * output is written to the role's research.md and the run id is cleared. The
 * caller (Activepieces) re-invokes until status is `done` (or `failed`), so a
 * request never blocks waiting on a multi-minute hermes run.
 */
export async function runResearch(roleUid: string): Promise<ResearchOutcome> {
  const row = await getIdMap(roleUid);
  if (!row) {
    return { reason: "unknown role", status: "skipped" };
  }
  const meta = row.meta as {
    applicationUrl?: string;
    jdUrl?: string;
    researchRunId?: string;
  };

  // First pass — submit the hermes run.
  if (!meta.researchRunId) {
    const runId = await submitHermesRun({
      instructions: RESEARCH_INSTRUCTIONS,
      task: buildResearchTask({
        applicationUrl: meta.applicationUrl ?? "",
        company: row.companySlug ?? "",
        jdUrl: meta.jdUrl ?? "",
        title: row.title ?? "",
      }),
    });
    if (!runId) {
      // Hermes unreachable — leave state unchanged; the bus retries.
      return { reason: "hermes unavailable", status: "skipped" };
    }
    await upsertIdMap({ meta: { ...row.meta, researchRunId: runId }, roleUid });
    return { runId, status: "submitted" };
  }

  // Subsequent passes — poll the in-flight run.
  const run = await getHermesRun(meta.researchRunId);
  if (!run) {
    return { runId: meta.researchRunId, status: "running" };
  }
  if (run.status === "completed" && run.output) {
    const dir =
      row.contextPath ?? roleDir(row.title ?? roleUid, row.companySlug ?? "");
    await upsertContextFile(
      `${dir}/research.md`,
      researchDoc(roleUid, run.output),
      `madrigal: research ${roleUid}`
    );
    await upsertIdMap({
      meta: { ...row.meta, researchRunId: undefined },
      roleUid,
    });
    return { status: "done" };
  }
  if (run.status === "failed" || run.status === "cancelled") {
    await upsertIdMap({
      meta: { ...row.meta, researchRunId: undefined },
      roleUid,
    });
    return { status: "failed" };
  }
  return { runId: meta.researchRunId, status: "running" };
}
