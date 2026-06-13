import type { CalendarEvent } from "@/types/calendar";

/** Drill-down focus within the Context tab. */
export type ContextFocus =
  | { type: "none" }
  | { type: "meeting"; event: CalendarEvent }
  | { type: "stream"; streamId: string }
  | { type: "repo"; fullName: string };

export const CONTEXT_FOCUS_NONE: ContextFocus = { type: "none" };
