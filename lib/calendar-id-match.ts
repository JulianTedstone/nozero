/** Normalize CalDAV calendar URLs for subscription matching. */
export function normalizeCalDavCalendarId(id: string): string {
  const trimmed = id.trim();
  try {
    const url = new URL(trimmed);
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    url.hash = "";
    url.search = "";
    return decodeURIComponent(url.href);
  } catch {
    return decodeURIComponent(trimmed.replace(/\/+$/, ""));
  }
}

export function calDavCalendarIdsMatch(
  storedId: string,
  serverId: string,
): boolean {
  return (
    normalizeCalDavCalendarId(storedId) ===
    normalizeCalDavCalendarId(serverId)
  );
}
