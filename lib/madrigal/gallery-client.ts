import "server-only";

/**
 * Gallery WRITE client — the nopilot-co-www showcase surface (aqua-backed).
 * Targets nopilot-co-www ONLY; it has NO connection to soma (soma-services is
 * deprecated — do not route through it). Used by the adapt stage to publish
 * per-application dockets (variant CV / cover letter) into the `madrigal`
 * gallery and grant the owner access.
 *
 * Contract (nopilot-co-www `src/app/api/showcase/*`):
 *   POST {base}/api/showcase/galleries        {title, hostEmail?, intro?}     -> {ok, code}
 *   POST {base}/api/showcase/{code}/assets     {url} (or multipart file)       -> {ok, asset:{id}}
 *   POST {base}/api/showcase/{code}/grants     {email, scopes?, name?, title?} -> {ok, token, link}
 *
 * Auth: nopilot-co-www super-admin (julian@nopilot.co) via a Supabase bearer JWT
 * in NOZERO_GALLERY_BEARER. (Production should mint a short-lived super-admin JWT
 * via Supabase sign-in — creds in 1Password — rather than a static token.)
 *
 * Fail-safe — DO NOT WEAKEN: every call returns a result object and NEVER throws
 * to the pipeline. The context-vault draft is the durable artefact; the gallery
 * publish is a best-effort layer on top.
 *
 * PENDING LIVE VERIFICATION (Flightdeck npt-madrigal #105): base URL + auth not
 * yet exercised against the live nopilot-co-www gallery. Publishing is gated off
 * by default (config.docket.publish = false) until verified.
 */

const BASE_URL = process.env.NOZERO_GALLERY_BASE_URL?.replace(/\/$/, "") ?? "";

export interface GalleryResult {
  ok: boolean;
  reason?: string;
}

export function galleryConfigured(): boolean {
  return Boolean(BASE_URL && process.env.NOZERO_GALLERY_BEARER);
}

function authHeaders(): Record<string, string> {
  const bearer = process.env.NOZERO_GALLERY_BEARER;
  return bearer ? { Authorization: `Bearer ${bearer}` } : {};
}

async function postJson(
  path: string,
  body: unknown
): Promise<{ status: number; json: unknown } | null> {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "POST",
      signal: AbortSignal.timeout(30_000),
    });
    return { json: await res.json().catch(() => ({})), status: res.status };
  } catch {
    return null;
  }
}

/** Ensure the per-application gallery exists; returns its code (idempotent-ish). */
export async function ensureGallery(input: {
  title: string;
  hostEmail: string;
}): Promise<GalleryResult & { code?: string }> {
  if (!galleryConfigured()) {
    return { ok: false, reason: "gallery not configured" };
  }
  const res = await postJson("/api/showcase/galleries", {
    hostEmail: input.hostEmail,
    title: input.title,
  });
  if (!res) {
    return { ok: false, reason: "gallery unreachable" };
  }
  const data = res.json as { ok?: boolean; code?: string; error?: string };
  if (!(data.ok && data.code)) {
    return { ok: false, reason: data.error ?? `http ${res.status}` };
  }
  return { code: data.code, ok: true };
}

/** Publish an already-hosted artefact (by URL) into the gallery. */
export async function uploadAssetByUrl(
  code: string,
  url: string
): Promise<GalleryResult & { assetId?: string }> {
  if (!galleryConfigured()) {
    return { ok: false, reason: "gallery not configured" };
  }
  const res = await postJson(`/api/showcase/${code}/assets`, { url });
  if (!res) {
    return { ok: false, reason: "gallery unreachable" };
  }
  const data = res.json as {
    ok?: boolean;
    asset?: { id?: string };
    error?: string;
  };
  if (!data.ok) {
    return { ok: false, reason: data.error ?? `http ${res.status}` };
  }
  return { assetId: data.asset?.id, ok: true };
}

/** Grant gallery access to an email (scoped — never public, per #94). */
export async function grantAccess(input: {
  code: string;
  email: string;
  scopes?: string[];
}): Promise<GalleryResult & { link?: string }> {
  if (!galleryConfigured()) {
    return { ok: false, reason: "gallery not configured" };
  }
  const res = await postJson(`/api/showcase/${input.code}/grants`, {
    email: input.email,
    scopes: input.scopes ?? ["view"],
  });
  if (!res) {
    return { ok: false, reason: "gallery unreachable" };
  }
  const data = res.json as { ok?: boolean; link?: string; error?: string };
  if (!data.ok) {
    return { ok: false, reason: data.error ?? `http ${res.status}` };
  }
  return { link: data.link, ok: true };
}
