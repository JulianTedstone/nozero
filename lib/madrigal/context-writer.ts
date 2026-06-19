import "server-only";

import { getRepoFile, putRepoFile } from "@/lib/github-content";

// The madrigal context vault. github-content's ALLOWED_OWNER is `juliantedstone`,
// which covers this repo (owner compare is case-insensitive).
const MADRIGAL_REPO = "juliantedstone/context-message-madrigal";

/** Upsert a file in the madrigal context repo (create, or update via its sha). */
export async function upsertContextFile(
  path: string,
  content: string,
  message: string
): Promise<{ sha: string }> {
  let sha: string | undefined;
  try {
    sha = (await getRepoFile(MADRIGAL_REPO, path)).sha;
  } catch {
    // Not present yet — create it (getRepoFile throws on 404).
  }
  return putRepoFile({ content, fullName: MADRIGAL_REPO, message, path, sha });
}

/** `search/roles/<role>-<company>` — the role directory. */
export function roleDir(roleSlug: string, companySlug: string): string {
  return `search/roles/${roleSlug}-${companySlug}`;
}

/** `search/companies/<company>` — the company directory. */
export function companyDir(companySlug: string): string {
  return `search/companies/${companySlug}`;
}

// Build YAML frontmatter from ordered pairs (arrays preserve field order).
function frontmatter(pairs: [string, string][]): string {
  const body = pairs.map(([key, value]) => `${key}: ${value}`).join("\n");
  return `---\n${body}\n---\n`;
}

/** Initial role.md stub written at intake (status = researching). */
export function buildRoleStub(input: {
  roleUid: string;
  title: string;
  companySlug: string;
  applicationUrl: string;
  jdUrl: string;
}): string {
  const fm = frontmatter([
    ["role_uid", input.roleUid],
    ["title", input.title],
    ["company", input.companySlug],
    ["status", "researching"],
    ["fit_score", ""],
    ["gate", "pending"],
  ]);
  return `${fm}
# ${input.title} — ${input.companySlug}

## Links
- Application: ${input.applicationUrl}
- JD: ${input.jdUrl}

## Job summary
_pending research_

## Employer summary
_pending research_

## Fit rationale
_pending score_
`;
}

/** Initial company.md stub written at intake. */
export function buildCompanyStub(companySlug: string): string {
  const fm = frontmatter([
    ["company_slug", companySlug],
    ["name", companySlug],
  ]);
  return `${fm}
# ${companySlug}

## Overview
_pending research_

## Signals
_pending research_
`;
}
