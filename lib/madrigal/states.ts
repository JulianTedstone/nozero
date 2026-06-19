import type { MadrigalState } from "@/lib/madrigal/types";

/**
 * Allowed forward transitions of the status machine. The gate (score) branches
 * to either `applying` or `disqualified`; any state may divert to `needs-human`.
 */
export const TRANSITIONS: Record<MadrigalState, MadrigalState[]> = {
  "to-do": ["researching"],
  researching: ["applying", "disqualified"],
  applying: ["adapting"],
  adapting: ["ready"],
  ready: ["submitting"],
  submitting: ["applied", "needs-human"],
  applied: ["following-up"],
  "following-up": ["closed"],
  disqualified: [],
  closed: [],
  "needs-human": ["applying", "adapting", "ready", "submitting"],
};

/** Whether `from -> to` is a legal transition. Any stage may divert to needs-human. */
export function canTransition(from: MadrigalState, to: MadrigalState): boolean {
  if (to === "needs-human") {
    return true;
  }
  return TRANSITIONS[from]?.includes(to) ?? false;
}
