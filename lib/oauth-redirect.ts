function isLocalHost(host: string): boolean {
  return host.includes("localhost") || host.startsWith("127.0.0.1");
}

function originFromRequestHost(request: Request): string | null {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost || request.headers.get("host");
  if (!host) return null;

  const protocol =
    forwardedProto ||
    (isLocalHost(host) ? "http" : "https");
  return `${protocol}://${host}`;
}

/** Public site origin for OAuth callbacks (respects reverse-proxy headers). */
export function getPublicOrigin(request: Request): string {
  const requestOrigin = originFromRequestHost(request);
  // Local dev: always match the port the browser hit (SITE_URL is often :3000 while dev runs on :3001).
  if (requestOrigin && isLocalHost(new URL(requestOrigin).host)) {
    return requestOrigin;
  }

  const explicit =
    process.env.SITE_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, "");
  }

  if (requestOrigin) return requestOrigin;

  return new URL(request.url).origin;
}

/** Redirect URI registered with Krisp for this app. */
export function getKrispRedirectUri(request: Request): string {
  const requestOrigin = originFromRequestHost(request);
  if (requestOrigin && isLocalHost(new URL(requestOrigin).host)) {
    return `${requestOrigin}/api/accounts/krisp/callback`;
  }

  const configured = process.env.KRISP_MCP_REDIRECT_URI?.trim();
  if (configured) return configured;
  return `${getPublicOrigin(request)}/api/accounts/krisp/callback`;
}
