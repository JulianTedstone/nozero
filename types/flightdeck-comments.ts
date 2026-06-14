export interface FlightdeckComment {
  author: string;
  body: string;
  createdAt: string;
}

export interface FlightdeckThreadPayload {
  comments: FlightdeckComment[];
  error?: string;
}
