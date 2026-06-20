import "server-only";

import { hermesChat } from "@/lib/hermes-client";
import { roleDir, upsertContextFile } from "@/lib/madrigal/context-writer";
import { getIdMap } from "@/lib/madrigal/id-map";

export type ResearchOutcome =
  | { status: "done" }
  | { status: "failed" }
  | { reason: string; status: "skipped" };

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
 * Research stage — synchronous. Sends the role + links to hermes in one chat
 * turn (which may block for minutes) and writes the reply to the role's
 * research.md. `skipped` if hermes is unreachable (the caller can retry).
 */
export async function runResearch(roleUid: string): Promise<ResearchOutcome> {
  const row = await getIdMap(roleUid);
  if (!row) {
    return { reason: "unknown role", status: "skipped" };
  }
  const meta = row.meta as { applicationUrl?: string; jdUrl?: string };

  const answer = await hermesChat({
    instructions: RESEARCH_INSTRUCTIONS,
    message: buildResearchTask({
      applicationUrl: meta.applicationUrl ?? "",
      company: row.companySlug ?? "",
      jdUrl: meta.jdUrl ?? "",
      title: row.title ?? "",
    }),
  });
  if (!answer) {
    return { reason: "hermes unavailable", status: "skipped" };
  }

  const dir =
    row.contextPath ?? roleDir(row.title ?? roleUid, row.companySlug ?? "");
  await upsertContextFile(
    `${dir}/research.md`,
    researchDoc(roleUid, answer),
    `madrigal: research ${roleUid}`
  );
  return { status: "done" };
}
