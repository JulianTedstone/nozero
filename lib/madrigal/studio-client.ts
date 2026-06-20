import "server-only";

/**
 * Studio-runner client — the HTTP front for nopilot-co-studio's design-studio
 * render (Markdown -> branded PDF via Quarto + Typst).
 *
 * WHY A RUNNER: design-studio is a Claude Code plugin, not a service, so nozero
 * cannot invoke it directly. The "studio runner" is a thin HTTP service that runs
 * the render and returns artefact URLs — the same shape as `hermes` fronting the
 * research agent. nozero only ever talks to the runner.
 *
 * Contract (target):
 *   POST {base}/render  {role_uid, kind, markdown, brand?}  -> {ok, url}
 *     kind: "cv" | "cover"   ·   url: hosted PDF, ready to hand to the gallery.
 *
 * Auth: bearer in NOZERO_STUDIO_API_KEY. Fail-safe — never throws; an
 * unconfigured / unreachable runner returns {ok:false} and the pipeline keeps
 * the markdown draft.
 *
 * PENDING: the studio-runner service itself is not yet stood up (tracked as its
 * own npt-madrigal infra ticket — analogous to the jupiter hermes-webui and
 * camouflex services). Until it exists, renderDocket no-ops fail-safe.
 */

const STUDIO_URL = process.env.NOZERO_STUDIO_API_URL?.replace(/\/$/, "") ?? "";

export interface RenderResult {
  ok: boolean;
  reason?: string;
  url?: string;
}

export function studioConfigured(): boolean {
  return Boolean(STUDIO_URL);
}

export async function renderDocket(input: {
  roleUid: string;
  kind: "cv" | "cover";
  markdown: string;
  brand?: string;
}): Promise<RenderResult> {
  if (!studioConfigured()) {
    return { ok: false, reason: "studio runner not configured" };
  }
  const key = process.env.NOZERO_STUDIO_API_KEY;
  try {
    const res = await fetch(`${STUDIO_URL}/render`, {
      body: JSON.stringify({
        brand: input.brand ?? "nopilot",
        kind: input.kind,
        markdown: input.markdown,
        role_uid: input.roleUid,
      }),
      headers: {
        "Content-Type": "application/json",
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      method: "POST",
      signal: AbortSignal.timeout(120_000),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      url?: string;
      error?: string;
    };
    if (!(data.ok && data.url)) {
      return { ok: false, reason: data.error ?? `http ${res.status}` };
    }
    return { ok: true, url: data.url };
  } catch {
    return { ok: false, reason: "studio unreachable" };
  }
}
