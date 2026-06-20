import { z } from "zod";

/** The ticket status machine (mirrored to the Twenty opportunity stage). */
export const MADRIGAL_STATES = [
  "to-do",
  "researching",
  "applying",
  "disqualified",
  "adapting",
  "ready",
  "submitting",
  "applied",
  "following-up",
  "closed",
  "needs-human",
] as const;
export type MadrigalState = (typeof MADRIGAL_STATES)[number];

/** A row in madrigal.id_map — the cross-system join keyed by role_uid. */
export interface IdMapRow {
  calendarEvents: string[];
  companyPath: string | null;
  companySlug: string | null;
  contextPath: string | null;
  createdAt: string;
  docketAssets: string[];
  docketGalleryCode: string | null;
  fitScore: number | null;
  flightdeckItem: string | null;
  githubIssue: string | null;
  gmailThread: string | null;
  meta: Record<string, unknown>;
  roleUid: string;
  state: MadrigalState;
  title: string | null;
  twentyCompany: string | null;
  twentyOpportunity: string | null;
  twentyPeople: string[];
  updatedAt: string;
}

/**
 * The Activepieces transition envelope — one schema for every stage hop, so the
 * same trigger/hook pattern generalises to other pipelines. Mirrors
 * contracts/README.md in context-message-madrigal.
 */
export const eventEnvelopeSchema = z.object({
  role_uid: z.string().min(1),
  from_state: z.enum(MADRIGAL_STATES).nullable(),
  to_state: z.enum(MADRIGAL_STATES),
  actor: z.string().min(1),
  ts: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).default({}),
});
export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;
