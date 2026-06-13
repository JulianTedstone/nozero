export type EventDetailSectionId = "what" | "where" | "when";

export const DEFAULT_EVENT_SECTION_ORDER: EventDetailSectionId[] = [
  "what",
  "where",
  "when",
];

export const EVENT_SECTION_LABELS: Record<EventDetailSectionId, string> = {
  what: "What",
  where: "Where",
  when: "When",
};

export function parseEventSectionOrder(
  value: unknown,
): EventDetailSectionId[] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_EVENT_SECTION_ORDER];
  }

  const allowed = new Set<EventDetailSectionId>(["what", "where", "when"]);
  const parsed = value.filter(
    (item): item is EventDetailSectionId =>
      typeof item === "string" && allowed.has(item as EventDetailSectionId),
  );

  if (parsed.length !== 3) {
    return [...DEFAULT_EVENT_SECTION_ORDER];
  }

  const unique = new Set(parsed);
  if (unique.size !== 3) {
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
