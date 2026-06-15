/** Pure helpers for Google-scoped local event ids (safe for client bundles). */

export function googleAccountSlug(accountEmail: string): string {
  return accountEmail.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

/** Stable local event id scoped to a Google account (avoids cross-account collisions). */
export function googleLocalEventId(
  accountEmail: string,
  googleEventId: string,
): string {
  return `google_${googleAccountSlug(accountEmail)}_${googleEventId}`;
}

/** Reverse {@link googleLocalEventId} when the account email is among known candidates. */
export function accountEmailFromGoogleLocalId(
  localId: string,
  candidateEmails: string[],
): string | undefined {
  if (!localId.startsWith("google_")) return undefined;
  const rest = localId.slice("google_".length);
  const lastUnderscore = rest.lastIndexOf("_");
  if (lastUnderscore <= 0) return undefined;
  const slug = rest.slice(0, lastUnderscore);
  for (const email of candidateEmails) {
    if (googleAccountSlug(email) === slug) return email;
  }
  return undefined;
}

export function googleEventIdFromLocalId(localId: string): string {
  if (!localId.startsWith("google_")) {
    throw new Error("Not a Google Calendar event");
  }
  const rest = localId.slice("google_".length);
  const lastUnderscore = rest.lastIndexOf("_");
  return lastUnderscore >= 0 ? rest.slice(lastUnderscore + 1) : rest;
}
