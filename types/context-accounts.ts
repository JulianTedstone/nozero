/** GitHub context-message repo linked to an email account. */
export interface ContextRepoRef {
  owner: string;
  name: string;
  fullName: string;
}

/** How a binding was established. */
export type ContextBindingSource = "rule" | "inferred" | "user";

/**
 * Maps one email account → context repos → Flightdeck streams.
 * 1 account : many repos : many streams (user-confirmed or rule-driven).
 */
export interface ContextAccountBinding {
  id: string;
  accountEmail: string;
  repos: ContextRepoRef[];
  streams: string[];
  source: ContextBindingSource;
  /** User explicitly confirmed inferred/rule mapping in Settings. */
  confirmed?: boolean;
}

export interface ContextBindingsPreferences {
  contextBindings?: ContextAccountBinding[];
  /** GitHub username used to list/select context repos in Settings. */
  githubUsername?: string;
}
