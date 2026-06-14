/** GitHub Project #17 single-select options (defaults when GraphQL fetch unavailable). */
export interface FlightdeckFieldOptions {
  streams: string[];
  owners: string[];
  approvers: string[];
  approvals: string[];
  priorities: string[];
}

export const DEFAULT_FLIGHTDECK_FIELD_OPTIONS: FlightdeckFieldOptions = {
  streams: [
    "npt-flightdeck",
    "npt-nopilot",
    "npt-ops",
    "npt-360",
    "npt-job-search",
    "npt-mha",
    "npt-messaging",
    "npt-followups",
    "ted-context",
    "ted-health",
    "rtt-health",
    "btt-health",
    "btt-school",
    "ttt-health",
    "ttt-school",
    "lht-care",
    "coh-messaging",
    "mha-messaging",
    "nps-messaging",
  ],
  owners: [
    "Bertrand",
    "Ted",
    "Claude",
    "Hermes",
    "Pierre",
    "Cecil",
    "Geoffrey",
    "Hilda",
    "Beatrice",
    "Rosamund",
  ],
  approvers: [
    "Ted",
    "Claude",
    "Hermes",
    "Any-agent",
    "Pierre",
    "Bertrand",
    "Cecil",
  ],
  approvals: ["User", "Named Agent", "Any Agent"],
  priorities: ["Urgent", "High", "Medium", "Low"],
};

export function mergeFieldOptions(
  fetched: Partial<FlightdeckFieldOptions> | null | undefined,
): FlightdeckFieldOptions {
  const base = DEFAULT_FLIGHTDECK_FIELD_OPTIONS;
  return {
    streams: uniq([...(fetched?.streams ?? []), ...base.streams]),
    owners: uniq([...(fetched?.owners ?? []), ...base.owners]),
    approvers: uniq([...(fetched?.approvers ?? []), ...base.approvers]),
    approvals: uniq([...(fetched?.approvals ?? []), ...base.approvals]),
    priorities: uniq([...(fetched?.priorities ?? []), ...base.priorities]),
  };
}

function uniq(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}
