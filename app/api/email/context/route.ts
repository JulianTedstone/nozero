import "server-only";

import { NextResponse } from "next/server";
import { getCurrentAuthUser } from "@/lib/auth-server";
import { resolveCrmContext } from "@/lib/crm-mirror";
import { searchFlightdeckTasks } from "@/lib/flightdeck-client";
import { oneMinComplete } from "@/lib/onemin";
import { searchSomaDeals } from "@/lib/soma-client";
import type {
  EmailThreadContext,
  SuggestedTask,
  ThreadDigest,
} from "@/types/email";

export const runtime = "nodejs";
export const maxDuration = 30;

interface EmailContextRequest {
  bodyExcerpt?: string | null;
  participants?: string[];
  subject?: string;
  threadIntent?: string | null;
  streams?: string[];
  availableStreams?: string[];
  existingTasks?: string[];
}

function normalizeEmails(raw?: string[]): string[] {
  return [
    ...new Set(
      (raw ?? [])
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.includes("@")),
    ),
  ];
}

/** Pull the first JSON object out of a model response, defensively. */
function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) {
    return null;
  }
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function buildDigest(input: {
  subject: string;
  participants: string[];
  bodyExcerpt?: string | null;
  existingTasks: string[];
  streams: string[];
}): Promise<{ digest: ThreadDigest | null; suggestedTasks: SuggestedTask[] }> {
  const prompt = `You are briefing a busy operator on an email thread.

Subject: ${input.subject}
Participants: ${input.participants.join(", ") || "unknown"}
Existing related tasks (do NOT duplicate these): ${
    input.existingTasks.length ? input.existingTasks.join("; ") : "none"
  }
Available Flightdeck streams: ${input.streams.join(", ") || "none"}

Thread content:
${input.bodyExcerpt?.slice(0, 4000) ?? "none"}

Return ONLY a JSON object, no prose, with exactly this shape:
{
  "topic": "one sentence: what the thread is about",
  "participants": "one sentence: key people and their apparent role",
  "development": "one sentence: how the discussion has progressed",
  "state": "one sentence: the current state and what is outstanding",
  "suggestedTasks": [
    { "title": "imperative task title", "rationale": "why, one short clause", "stream": "best-matching stream from the list, or null" }
  ]
}
Suggest 0-4 tasks that are genuinely actionable and not already covered by the existing related tasks. If nothing is actionable, use an empty array.`;

  try {
    const text = await oneMinComplete(prompt);
    if (!text) {
      return { digest: null, suggestedTasks: [] };
    }
    const parsed = extractJson(text) as Record<string, unknown> | null;
    if (!parsed) {
      return { digest: null, suggestedTasks: [] };
    }
    const str = (v: unknown): string | null =>
      typeof v === "string" && v.trim() ? v.trim() : null;
    const digest: ThreadDigest = {
      topic: str(parsed.topic),
      participants: str(parsed.participants),
      development: str(parsed.development),
      state: str(parsed.state),
    };
    const streamSet = new Set(input.streams);
    const suggestedTasks: SuggestedTask[] = Array.isArray(parsed.suggestedTasks)
      ? parsed.suggestedTasks
          .map((t) => {
            const obj = (t ?? {}) as Record<string, unknown>;
            const title = str(obj.title);
            if (!title) {
              return null;
            }
            const stream = str(obj.stream);
            return {
              title,
              rationale: str(obj.rationale),
              stream: stream && streamSet.has(stream) ? stream : null,
            } satisfies SuggestedTask;
          })
          .filter((t): t is SuggestedTask => t !== null)
          .slice(0, 4)
      : [];
    return { digest, suggestedTasks };
  } catch {
    return { digest: null, suggestedTasks: [] };
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
  const streams = body.streams ?? [];
  const availableStreams = body.availableStreams?.length
    ? body.availableStreams
    : streams;
  const existingTasks = (body.existingTasks ?? []).filter(Boolean);
  const errors: EmailThreadContext["errors"] = {};

  const context: EmailThreadContext = {
    subject,
    threadIntent: body.threadIntent?.trim() || null,
    streams,
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
    digest: null,
    suggestedTasks: [],
    errors,
  };

  await Promise.allSettled([
    (async () => {
      // Mirror-first, fail-safe resolution: serves the nozero mirror + local
      // store immediately and only enriches from aqua when the link is live.
      const { people, companies } = await resolveCrmContext(user.id, participants);
      context.people = people;
      context.companies = companies;
      // Deals are a best-effort search; the client already returns [] on a
      // down link, so a failure here never affects the response.
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
      const { digest, suggestedTasks } = await buildDigest({
        subject,
        participants,
        bodyExcerpt: body.bodyExcerpt,
        existingTasks,
        streams: availableStreams,
      });
      context.digest = digest;
      context.suggestedTasks = suggestedTasks;
      if (digest?.topic) {
        context.summary.text = digest.topic;
        context.summary.sources.push("email");
      } else if (body.threadIntent) {
        context.summary.text = body.threadIntent;
        context.summary.sources.push("email");
      }
    })(),
  ]);

  return NextResponse.json(context);
}
