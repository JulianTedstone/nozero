export type ConferenceProvider =
  | "teams"
  | "zoom"
  | "meet"
  | "slack"
  | "webex"
  | "other";

const CONFERENCE_URL_PATTERNS: RegExp[] = [
  /https?:\/\/teams\.microsoft\.com\/[^\s<>"')\]]+/gi,
  /https?:\/\/[\w.-]*zoom\.us\/[^\s<>"')\]]+/gi,
  /https?:\/\/meet\.google\.com\/[^\s<>"')\]]+/gi,
  /https?:\/\/[\w.-]*\.webex\.com\/[^\s<>"')\]]+/gi,
  /https?:\/\/[\w.-]*slack\.com\/[^\s<>"')\]]+/gi,
  /https?:\/\/whereby\.com\/[^\s<>"')\]]+/gi,
  /https?:\/\/[\w.-]*gotomeeting\.com\/[^\s<>"')\]]+/gi,
  /https?:\/\/[\w.-]*bluejeans\.com\/[^\s<>"')\]]+/gi,
];

function stripTrailingPunctuation(url: string): string {
  return url.replace(/[.,;:!?)>\]]+$/u, "");
}

/** Find the first known video-conference URL in plain or HTML text. */
export function extractConferenceUrl(
  ...sources: (string | null | undefined)[]
): string | null {
  for (const source of sources) {
    if (!source?.trim()) continue;
    const text = source
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ");

    for (const pattern of CONFERENCE_URL_PATTERNS) {
      pattern.lastIndex = 0;
      const match = pattern.exec(text);
      if (match?.[0]) {
        return stripTrailingPunctuation(match[0]);
      }
    }
  }
  return null;
}

export function detectConferenceProvider(url: string): ConferenceProvider {
  const lower = url.toLowerCase();
  if (lower.includes("teams.microsoft.com")) return "teams";
  if (lower.includes("zoom.us")) return "zoom";
  if (lower.includes("meet.google.com")) return "meet";
  if (lower.includes("slack.com")) return "slack";
  if (lower.includes("webex.com")) return "webex";
  return "other";
}

export function conferenceProviderLabel(provider: ConferenceProvider): string {
  switch (provider) {
    case "teams":
      return "Teams";
    case "zoom":
      return "Zoom";
    case "meet":
      return "Google Meet";
    case "slack":
      return "Slack";
    case "webex":
      return "Webex";
    default:
      return "Video call";
  }
}

export function conferenceUrlFromGoogleEvent(event: {
  hangoutLink?: string | null;
  conferenceData?: {
    entryPoints?: Array<{ entryPointType?: string; uri?: string }>;
  } | null;
  description?: string | null;
}): string | null {
  const fromHangout = event.hangoutLink?.trim();
  if (fromHangout) return fromHangout;

  const videoEntry = event.conferenceData?.entryPoints?.find(
    (entry) =>
      entry.entryPointType === "video" && entry.uri?.startsWith("http"),
  );
  if (videoEntry?.uri) return videoEntry.uri;

  return extractConferenceUrl(event.description);
}

/**
 * Prefer opening Meet (and similar) in the Google account that owns the calendar
 * subscription, via `authuser` — matches Google Calendar's account-scoped join.
 */
export function conferenceJoinUrl(
  url: string,
  accountEmail?: string | null,
): string {
  const trimmed = url.trim();
  if (!trimmed || !accountEmail?.includes("@")) return trimmed;

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    if (host === "meet.google.com" || host.endsWith(".meet.google.com")) {
      parsed.searchParams.set("authuser", accountEmail.trim());
      return parsed.toString();
    }
  } catch {
    return trimmed;
  }

  return trimmed;
}
