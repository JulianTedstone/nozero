export const FLIGHTDECK_KNOWN_OWNERS = [
  "Ted",
  "Claude",
  "Bertrand",
  "Pierre",
  "Rosamund",
] as const;

export function defaultApprovalForStream(stream: string): {
  approval: string;
  approver: string;
} {
  if (
    stream === "npt-flightdeck" ||
    stream === "npt-ops" ||
    stream === "npt-nopilot"
  ) {
    return { approval: "Any Agent", approver: "Claude" };
  }
  if (stream === "ted-context") {
    return { approval: "Any Agent", approver: "Bertrand" };
  }
  return { approval: "User", approver: "Ted" };
}

export function deriveFlightdeckOwners(
  items: Array<{ owner: string | null }>,
): string[] {
  const fromBoard = items
    .map((item) => item.owner?.trim())
    .filter(Boolean) as string[];
  return [...new Set([...FLIGHTDECK_KNOWN_OWNERS, ...fromBoard])].sort(
    (a, b) => a.localeCompare(b),
  );
}
