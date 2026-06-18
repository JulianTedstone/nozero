function isLocalHost(host: string): boolean {
  return host.includes("localhost") || host.startsWith("127.0.0.1");
}

// `next start` on the host sets this to "production"; `next dev` to "development".
// It's the only reliable discriminator between "real local dev on a localhost
// port" and "production behind a reverse proxy that presents a localhost Host".
const IS_PRODUCTION = process.env.NODE_ENV === "production";

function originFromRequestHost(request: Request): string | null {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost || request.headers.get("host");
  if (!host) return null;

  const protocol = forwardedProto || (isLocalHost(host) ? "http" : "https");
  return `${protocol}://${host}`;
}

function explicitSiteOrigin(): string | null {
  const explicit = (
    process.env.SITE_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim()
  )?.replace(/\/$/, "");
  return explicit || null;
}

/** Public site origin for OAuth callbacks (respects reverse-proxy headers). */
export function getPublicOrigin(request: Request): string {
  const requestOrigin = originFromRequestHost(request);
  const explicit = explicitSiteOrigin();

  // Production must never emit a localhost origin. A reverse proxy that drops
  // X-Forwarded-Host makes the upstream request look like 127.0.0.1:3000, which
  // would otherwise hand OAuth providers (and post-callback redirects) a
  // localhost URL. Trust the configured public site URL first.
  if (IS_PRODUCTION) {
    if (explicit && !isLocalHost(new URL(explicit).host)) return explicit;
    if (requestOrigin && !isLocalHost(new URL(requestOrigin).host)) {
      return requestOrigin;
    }
  }

  // Public Host / X-Forwarded-Host wins over a localhost SITE_URL from aqua overlays.
  if (requestOrigin && !isLocalHost(new URL(requestOrigin).host)) {
    return requestOrigin;
  }
  if (explicit && !isLocalHost(new URL(explicit).host)) {
    return explicit;
  }

  // Local dev: match the port the browser hit (SITE_URL is often :3000 while dev runs on :3001).
  if (requestOrigin && isLocalHost(new URL(requestOrigin).host)) {
    return requestOrigin;
  }

  if (explicit) return explicit;
  if (requestOrigin) return requestOrigin;

  return new URL(request.url).origin;
}

/** Redirect URI registered with Krisp for this app. */
export function getKrispRedirectUri(request: Request): string {
  const configured = process.env.KRISP_MCP_REDIRECT_URI?.trim();

  // Production: the redirect_uri sent to Krisp (and re-sent at token exchange)
  // must be the pre-registered public callback. Deriving it from a proxied
  // request host can produce localhost and break the OAuth round-trip — which is
  // exactly the "redirects back to localhost" symptom. Prefer the configured URI.
  if (IS_PRODUCTION) {
    if (configured) return configured;
    return `${getPublicOrigin(request)}/api/accounts/krisp/callback`;
  }

  // Local dev: follow the browser host so each registered dev port works without
  // re-registering a single fixed URI.
  const requestOrigin = originFromRequestHost(request);
  if (requestOrigin && isLocalHost(new URL(requestOrigin).host)) {
    return `${requestOrigin}/api/accounts/krisp/callback`;
  }
  if (configured) return configured;
  return `${getPublicOrigin(request)}/api/accounts/krisp/callback`;
}
