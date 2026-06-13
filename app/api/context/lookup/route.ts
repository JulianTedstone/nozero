import "server-only";

import { NextResponse } from "next/server";
import { getCurrentAuthUser } from "@/lib/auth-server";

export const runtime = "nodejs";
export const maxDuration = 30;

export interface ContextParticipant {
  email: string;
  name: string | null;
  company: string | null;
  role: string | null;
  somaContactId: string | null;
  somaCompanyId: string | null;
}

export interface ContextDeal {
  name: string;
  stage: string | null;
  value: string | null;
  id: string | null;
}

export interface ContextLink {
  label: string;
  url: string;
  type: "contact" | "company" | "deal" | "general";
}

export interface LookupResult {
  background: string | null;
  participants: ContextParticipant[];
  deals: ContextDeal[];
  desiredOutput: string | null;
  links: ContextLink[];
}

const emptyResult = (participants: string[]): LookupResult => ({
  background: null,
  participants: participants.map((email) => ({
    email,
    name: null,
    company: null,
    role: null,
    somaContactId: null,
    somaCompanyId: null,
  })),
  deals: [],
  desiredOutput: null,
  links: [],
});

/** Delegates to the structured meeting context bundle (legacy LLM lookup shape). */
export async function POST(request: Request) {
  const { title, participants = [], startDate } = (await request.json()) as {
    title?: string;
    participants?: string[];
    startDate?: string;
  };

  if (!title?.trim() && participants.length === 0) {
    return Response.json(emptyResult([]));
  }

  const user = await getCurrentAuthUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const origin = new URL(request.url).origin;
  const res = await fetch(`${origin}/api/context/meeting`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: request.headers.get("cookie") ?? "",
    },
    body: JSON.stringify({
      title: title ?? "",
      start: startDate ?? null,
      attendees: participants,
    }),
  });

  if (!res.ok) {
    return Response.json(emptyResult(participants));
  }

  const bundle = (await res.json()) as {
    summary?: { purpose?: string | null };
    people?: ContextParticipant[];
    related?: { deals?: ContextDeal[] };
    links?: Array<{ label: string; url: string; type: string }>;
  };

  const result: LookupResult = {
    background: bundle.summary?.purpose ?? null,
    participants: bundle.people ?? [],
    deals: bundle.related?.deals ?? [],
    desiredOutput: null,
    links: (bundle.links ?? []).map((l) => ({
      label: l.label,
      url: l.url,
      type:
        l.type === "contact" ||
        l.type === "company" ||
        l.type === "deal"
          ? l.type
          : "general",
    })),
  };

  if (result.participants.length === 0 && participants.length > 0) {
    return Response.json(emptyResult(participants));
  }

  return Response.json(result);
}
