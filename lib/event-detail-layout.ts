export type EventDetailSectionId = "what" | "where" | "when" | "who";

export const DEFAULT_EVENT_SECTION_ORDER: EventDetailSectionId[] = [
  "what",
  "where",
  "when",
  "who",
];

export const EVENT_SECTION_LABELS: Record<EventDetailSectionId, string> = {
  what: "What",
  where: "Where",
  when: "When",
  who: "Who",
};

const ALL_SECTIONS: EventDetailSectionId[] = ["what", "where", "when", "who"];

export function parseEventSectionOrder(
  value: unknown,
): EventDetailSectionId[] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_EVENT_SECTION_ORDER];
  }

  const allowed = new Set<EventDetailSectionId>(ALL_SECTIONS);
  const parsed = value.filter(
    (item): item is EventDetailSectionId =>
      typeof item === "string" && allowed.has(item as EventDetailSectionId),
  );

  const unique = [...new Set(parsed)];

  // Legacy preferences saved before the Who section existed.
  if (
    unique.length === 3 &&
    unique.every((s) => s !== "who") &&
    ALL_SECTIONS.slice(0, 3).every((s) => unique.includes(s))
  ) {
    return [...unique, "who"];
  }

  if (parsed.length !== 4 || unique.length !== 4) {
    return [...DEFAULT_EVENT_SECTION_ORDER];
  }

  if (!ALL_SECTIONS.every((section) => unique.includes(section))) {
    return [...DEFAULT_EVENT_SECTION_ORDER];
  }

  return parsed;
}

export function moveSection(
  order: EventDetailSectionId[],
  section: EventDetailSectionId,
  direction: "up" | "down",
): EventDetailSectionId[] {
  const index = order.indexOf(section);
  if (index < 0) return order;

  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= order.length) return order;

  const next = [...order];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
