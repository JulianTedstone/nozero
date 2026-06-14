import type { FlightdeckFieldOptions } from "@/lib/flightdeck-field-options";

export interface FlightdeckBoardItem {
  id: string;
  ref: string | null;
  title: string;
  status: string;
  stream: string | null;
  owner: string | null;
  approval: string | null;
  approver: string | null;
  type: string | null;
  priority: string | null;
  recurrence: string | null;
  nextAction: string | null;
  projectLink: string | null;
  url: string | null;
  body: string | null;
}

export type FlightdeckBoardVerb =
  | "claim"
  | "start"
  | "submit_for_review"
  | "approve"
  | "request_changes"
  | "block"
  | "unblock";

export interface FlightdeckBoardPayload {
  projectNumber: number;
  projectOwner: string;
  columns: string[];
  streams: string[];
  owners: string[];
  fieldOptions: FlightdeckFieldOptions;
  items: FlightdeckBoardItem[];
  source: "tower" | "github";
  /** Tower MCP credential present — board verbs and capture work. */
  actionsEnabled: boolean;
  /** GitHub token present — comment read/write on linked issues. */
  commentsEnabled: boolean;
  error?: string;
}
