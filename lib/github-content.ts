/**
 * Minimal GitHub Contents/Git-Trees client for the context workspace.
 *
 * The context-message-* repos under `juliantedstone` are the single source of
 * truth for context files. The deployed app reads/writes them via the GitHub
 * API using the already-configured GITHUB_TOKEN (also used by Flightdeck), so
 * the same tree + inline editing works on zero.nopilot.co and locally. Edits
 * commit straight back to the repo, which syncs to ~/context on every machine.
 */

const GITHUB_API = "https://api.github.com";
const ALLOWED_OWNER = "juliantedstone";

function requireToken(): string {
  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) {
    throw new Error("GITHUB_TOKEN not configured");
  }
  return token;
}

/** Only owner-scoped, path-safe repos may be reached through this proxy. */
function assertAllowedRepo(fullName: string): { owner: string; name: string } {
  const [owner, name, ...rest] = fullName.split("/");
  if (
    owner?.toLowerCase() !== ALLOWED_OWNER ||
    !name ||
    rest.length > 0 ||
    name.includes("..")
  ) {
    throw new Error(`Repository not allowed: ${fullName}`);
  }
  return { owner, name };
}

/** Encode a repo-relative path for a URL while preserving slashes. */
function encodePath(path: string): string {
  return path
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

async function gh(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${requireToken()}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
}

export async function getDefaultBranch(fullName: string): Promise<string> {
  const { owner, name } = assertAllowedRepo(fullName);
  const res = await gh(`/repos/${owner}/${name}`);
  if (res.status === 404) {
    throw new Error("Repository not found");
  }
  if (!res.ok) {
    throw new Error(`Repo lookup failed (${res.status})`);
  }
  const data = (await res.json()) as { default_branch?: string };
  return data.default_branch ?? "main";
}

/** List text-editable blob paths in the repo (dotfiles and obvious binaries hidden). */
export async function getRepoTree(
  fullName: string,
  ref?: string,
): Promise<{ paths: string[]; ref: string }> {
  const { owner, name } = assertAllowedRepo(fullName);
  const branch = ref ?? (await getDefaultBranch(fullName));
  const res = await gh(
    `/repos/${owner}/${name}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
  );
  if (!res.ok) {
    throw new Error(`Tree fetch failed (${res.status})`);
  }
  const data = (await res.json()) as {
    tree?: Array<{ path: string; type: string }>;
  };
  const paths = (data.tree ?? [])
    .filter((node) => node.type === "blob")
    .map((node) => node.path)
    .filter((path) => !path.split("/").some((seg) => seg.startsWith(".")))
    .filter((path) => !/\.(png|jpe?g|gif|webp|svg|ico|pdf|zip|gz|woff2?|ttf|mp4|mov|webm)$/i.test(path))
    .sort((a, b) => a.localeCompare(b));
  return { paths, ref: branch };
}

export async function getRepoFile(
  fullName: string,
  path: string,
  ref?: string,
): Promise<{ content: string; sha: string }> {
  const { owner, name } = assertAllowedRepo(fullName);
  const query = ref ? `?ref=${encodeURIComponent(ref)}` : "";
  const res = await gh(
    `/repos/${owner}/${name}/contents/${encodePath(path)}${query}`,
  );
  if (res.status === 404) {
    throw new Error("File not found");
  }
  if (!res.ok) {
    throw new Error(`File fetch failed (${res.status})`);
  }
  const data = (await res.json()) as {
    content?: string;
    encoding?: string;
    sha: string;
  };
  const content =
    data.encoding === "base64" && data.content
      ? Buffer.from(data.content, "base64").toString("utf8")
      : (data.content ?? "");
  return { content, sha: data.sha };
}

export async function putRepoFile(input: {
  fullName: string;
  path: string;
  content: string;
  sha?: string | null;
  message?: string;
  ref?: string;
}): Promise<{ sha: string }> {
  const { owner, name } = assertAllowedRepo(input.fullName);
  const body: Record<string, unknown> = {
    message: input.message?.trim() || `nozero: update ${input.path}`,
    content: Buffer.from(input.content, "utf8").toString("base64"),
  };
  if (input.sha) {
    body.sha = input.sha;
  }
  if (input.ref) {
    body.branch = input.ref;
  }
  const res = await gh(
    `/repos/${owner}/${name}/contents/${encodePath(input.path)}`,
    { method: "PUT", body: JSON.stringify(body) },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Commit failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { content?: { sha?: string } };
  return { sha: data.content?.sha ?? "" };
}

export async function deleteRepoFile(input: {
  fullName: string;
  path: string;
  sha: string;
  message?: string;
  ref?: string;
}): Promise<void> {
  const { owner, name } = assertAllowedRepo(input.fullName);
  const body: Record<string, unknown> = {
    message: input.message?.trim() || `nozero: remove ${input.path}`,
    sha: input.sha,
  };
  if (input.ref) {
    body.branch = input.ref;
  }
  const res = await gh(
    `/repos/${owner}/${name}/contents/${encodePath(input.path)}`,
    { method: "DELETE", body: JSON.stringify(body) },
  );
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`Delete failed (${res.status}): ${text.slice(0, 200)}`);
  }
}
