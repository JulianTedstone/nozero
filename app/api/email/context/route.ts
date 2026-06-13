import "server-only";

import { generateText } from "ai";
import { NextResponse } from "next/server";
import { getCurrentAuthUser } from "@/lib/auth-server";
import { searchFlightdeckTasks } from "@/lib/flightdeck-client";
import { getOpenRouterModel } from "@/lib/openrouter";
import {
  fetchContactByEmail,
  resolveCompaniesForPeople,
  searchSomaDeals,
} from "@/lib/soma-client";
import type { EmailThreadContext } from "@/types/email";

export const runtime = "nodejs";
export const maxDuration = 30;

interface EmailContextRequest {
  bodyExcerpt?: string | null;
  participants?: string[];
  subject?: string;
  threadIntent?: string | null;
  streams?: string[];
}

function normalizeEmails(raw?: string[]): string[] {
  return [
    ...new Set(
      (raw ?? [])
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.includes("@"))
    ),
  ];
}

async function buildSummary(input: {
  subject: string;
  participants: string[];
  bodyExcerpt?: string | null;
}): Promise<string | null> {
  if (!process.env.OPENROUTER_API_KEY) {
    return null;
  }

  const peopleLine = input.participants.join(", ") || "unknown";
  const prompt = `Write a 1–2 sentence summary of this email thread (max 40 words).

Subject: ${input.subject}
Participants: ${peopleLine}
Excerpt: ${input.bodyExcerpt?.slice(0, 400) ?? "none"}

Return plain text only.`;

  try {
    const { text } = await generateText({
      model: getOpenRouterModel(),
      prompt,
      maxTokens: 120,
    });
    return text.trim() || null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const user = await getCurrentAuthUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as EmailContextRequest;
  const subject = body.subject?.trim() || "(No subject)";
  const participants = normalizeEmails(body.participants);
  const errors: EmailThreadContext["errors"] = {};

  const context: EmailThreadContext = {
    subject,
    threadIntent: body.threadIntent?.trim() || null,
    streams: body.streams ?? [],
    people: participants.map((email) => ({
      email,
      name: null,
      role: null,
      company: null,
      somaContactId: null,
      somaCompanyId: null,
      source: "attendee" as const,
    })),
    companies: [],
    deals: [],
    tasks: [],
    summary: { text: null, sources: [] },
    errors,
  };

  await Promise.allSettled([
    (async () => {
      const people = await Promise.all(
        participants.map((email) => fetchContactByEmail(email))
      );
      for (let i = 0; i < participants.length; i++) {
        const p = people[i];
        if (p) {
          context.people[i] = p;
        }
      }
      context.companies = await resolveCompaniesForPeople(context.people);
      context.deals = await searchSomaDeals(subject, 8);
      context.summary.sources.push("crm");
    })(),
    (async () => {
      const { tasks, error } = await searchFlightdeckTasks({
        query: subject,
        participantEmails: participants,
        limit: 12,
      });
      if (error) {
        errors.flightdeck = error;
      }
      context.tasks = tasks;
    })(),
    (async () => {
      const summary = await buildSummary({
        subject,
        participants,
        bodyExcerpt: body.bodyExcerpt,
      });
      if (summary) {
        context.summary.text = summary;
        context.summary.sources.push("email");
      } else if (body.threadIntent) {
        context.summary.text = body.threadIntent;
        context.summary.sources.push("email");
      }
    })(),
  ]);

  return NextResponse.json(context);
}
