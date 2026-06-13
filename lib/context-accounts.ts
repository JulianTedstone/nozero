import type {
  ContextAccountBinding,
  ContextBindingsPreferences,
  ContextRepoRef,
} from "@/types/context-accounts";

const GITHUB_OWNER = "juliantedstone";

/** Rule-driven defaults: account email → repos → Flightdeck streams. */
const DEFAULT_RULES: Array<{
  emailPattern: RegExp;
  repos: ContextRepoRef[];
  streams: string[];
}> = [
  {
    emailPattern: /@coherence\.digital$/i,
    repos: [repo("context-message-coh")],
    streams: [],
  },
  {
    emailPattern: /@gmail\.com$/i,
    repos: [repo("context-message-ted")],
    streams: ["npt-job-search", "npt-ted-health", "npt-child-care"],
  },
  {
    emailPattern: /@nopilot\.co$/i,
    repos: [repo("context-message-nopilot"), repo("context-message-360")],
    streams: ["npt-nopilot", "npt-flightdeck", "npt-360"],
  },
  {
    emailPattern: /@makinghuman\.ai$/i,
    repos: [repo("context-message-villanelle")],
    streams: [],
  },
];

function repo(name: string): ContextRepoRef {
  return {
    owner: GITHUB_OWNER,
    name,
    fullName: `${GITHUB_OWNER}/${name}`,
  };
}

function bindingId(accountEmail: string, repoFullName: string): string {
  return `${accountEmail.toLowerCase()}::${repoFullName}`;
}

export function inferBindingsForEmail(accountEmail: string): ContextAccountBinding[] {
  const normalized = accountEmail.trim().toLowerCase();
  const matches = DEFAULT_RULES.filter((r) => r.emailPattern.test(normalized));
  if (matches.length === 0) {
    return [];
  }

  const bindings: ContextAccountBinding[] = [];
  for (const rule of matches) {
    for (const repoRef of rule.repos) {
      bindings.push({
        id: bindingId(normalized, repoRef.fullName),
        accountEmail: normalized,
        repos: [repoRef],
        streams: [...rule.streams],
        source: "rule",
        confirmed: false,
      });
    }
  }
  return bindings;
}

/** Merge user-configured bindings with rule defaults (user wins on same id). */
export function mergeContextBindings(
  accountEmails: string[],
  prefs?: ContextBindingsPreferences | null,
): ContextAccountBinding[] {
  const userMap = new Map(
    (prefs?.contextBindings ?? []).map((b) => [b.id, b]),
  );
  const inferred: ContextAccountBinding[] = [];

  for (const email of accountEmails) {
    for (const b of inferBindingsForEmail(email)) {
      inferred.push(userMap.get(b.id) ?? b);
    }
  }

  for (const b of prefs?.contextBindings ?? []) {
    if (!inferred.some((x) => x.id === b.id)) {
      inferred.push(b);
    }
  }

  return inferred;
}

export function streamsForAccount(
  accountEmail: string,
  bindings: ContextAccountBinding[],
): string[] {
  const normalized = accountEmail.trim().toLowerCase();
  const streams = new Set<string>();
  for (const b of bindings) {
    if (b.accountEmail.toLowerCase() === normalized) {
      for (const s of b.streams) {
        streams.add(s);
      }
    }
  }
  return [...streams];
}

export function reposForAccount(
  accountEmail: string,
  bindings: ContextAccountBinding[],
): ContextRepoRef[] {
  const normalized = accountEmail.trim().toLowerCase();
  const seen = new Set<string>();
  const repos: ContextRepoRef[] = [];
  for (const b of bindings) {
    if (b.accountEmail.toLowerCase() !== normalized) {
      continue;
    }
    for (const r of b.repos) {
      if (!seen.has(r.fullName)) {
        seen.add(r.fullName);
        repos.push(r);
      }
    }
  }
  return repos;
}

export function githubRepoUrl(fullName: string): string {
  return `https://github.com/${fullName}`;
}
