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
  items: FlightdeckBoardItem[];
  source: "tower" | "github";
  error?: string;
}
