import "server-only";

import { generateText } from "ai";
import { NextResponse } from "next/server";
import { getCurrentAuthUser } from "@/lib/auth-server";
import { getEvents } from "@/lib/calendar";
import {
  mergeContextBindings,
  reposForAccount,
  streamsForAccount,
} from "@/lib/context-accounts";
import { ctxSummaryForMeeting } from "@/lib/ctx-gateway";
import { searchFlightdeckTasks } from "@/lib/flightdeck-client";
import { krispContextForMeeting } from "@/lib/krisp-mcp-client";
import { getOpenRouterModel } from "@/lib/openrouter";
import {
  fetchContactByEmail,
  resolveCompaniesForPeople,
  searchSomaDeals,
  searchSomaMessages,
  somaBaseUrl,
} from "@/lib/soma-client";
import { towerSearchTasks } from "@/lib/tower-gateway";
import type { MeetingContextBundle } from "@/types/meeting-context";
import type { ContextBindingsPreferences } from "@/types/context-accounts";

export const runtime = "nodejs";
export const maxDuration = 30;

interface MeetingContextRequest {
  eventId?: string | null;
  title: string;
  start?: string | null;
  end?: string | null;
  attendees?: string[];
  description?: string | null;
  accountEmail?: string | null;
  contextBindings?: ContextBindingsPreferences | null;
}

function attendeeEmails(attendees?: string[]): string[] {
  return (attendees ?? [])
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));
}

function overlapAttendees(a: string[], b: string[]): boolean {
  const set = new Set(a.map((x) => x.toLowerCase()));
  return b.some((e) => set.has(e.toLowerCase()));
}

async function buildLlmSummary(input: {
  title: string;
  description?: string | null;
  people: MeetingContextBundle["people"];
  deals: MeetingContextBundle["related"]["deals"];
  transcriptExcerpt?: string | null;
}): Promise<string | null> {
  if (!process.env.OPENROUTER_API_KEY) return null;

  const peopleLine = input.people
    .map((p) => `${p.name ?? p.email}${p.company ? ` (${p.company})` : ""}`)
    .join(", ");

  const dealsLine = input.deals.map((d) => d.name).join(", ");

  const prompt = `Write a 1–2 sentence meeting purpose summary (max 40 words).

Title: ${input.title}
Participants: ${peopleLine || "unknown"}
Deals: ${dealsLine || "none"}
Notes: ${input.description?.slice(0, 200) ?? "none"}
Transcript excerpt: ${input.transcriptExcerpt?.slice(0, 300) ?? "none"}

Return plain text only, no JSON.`;

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
  try {
    const user = await getCurrentAuthUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as MeetingContextRequest;
    const title = body.title?.trim() ?? "";
    const emails = attendeeEmails(body.attendees);
    const accountEmail =
      body.accountEmail?.trim().toLowerCase() ||
      user.email?.trim().toLowerCase() ||
      "";

    const bindings = mergeContextBindings(
      accountEmail ? [accountEmail] : [],
      body.contextBindings,
    );
    const repos = reposForAccount(accountEmail, bindings).map((r) => r.fullName);
    const streams = streamsForAccount(accountEmail, bindings);
    const primaryStream = streams[0];

    const errors: MeetingContextBundle["errors"] = {};
    const bundle: MeetingContextBundle = {
      eventId: body.eventId ?? null,
      title,
      start: body.start ?? null,
      end: body.end ?? null,
      stream: primaryStream
        ? { label: primaryStream, source: "inferred" }
        : undefined,
      streams,
      repos,
      summary: { purpose: null, sources: [] },
      people: emails.map((email) => ({
        email,
        name: null,
        role: null,
        company: null,
        somaContactId: null,
        somaCompanyId: null,
        source: "attendee" as const,
      })),
      companies: [],
      related: { deals: [], calendarEvents: [] },
      messages: [],
      transcripts: [],
      actions: [],
      tasks: [],
      links: [],
      errors,
    };

    const somaBase = somaBaseUrl();

    await Promise.allSettled([
      (async () => {
        if (!somaBase) {
          errors.soma = "Soma not configured";
          return;
        }
        const people = await Promise.all(
          emails.map((email) => fetchContactByEmail(email)),
        );
        for (let i = 0; i < emails.length; i++) {
          const p = people[i];
          if (p) bundle.people[i] = p;
        }
        bundle.companies = await resolveCompaniesForPeople(bundle.people);
        bundle.related.deals = await searchSomaDeals(title, 8);

        const messageQuery =
          title || emails.join(" ") || body.description?.slice(0, 80) || "";
        bundle.messages = await searchSomaMessages(messageQuery, 10);

        for (const person of bundle.people) {
          if (person.somaContactId && somaBase) {
            bundle.links.push({
              label: person.name ?? person.email,
              url: `${somaBase}/contacts/${person.somaContactId}`,
              type: "contact",
            });
          }
        }
        for (const company of bundle.companies) {
          if (company.somaUrl) {
            bundle.links.push({
              label: company.name,
              url: company.somaUrl,
              type: "company",
            });
          }
        }
        bundle.summary.sources.push("crm");
      })(),
      (async () => {
        if (!body.start) return;
        const start = new Date(body.start);
        const from = new Date(start);
        from.setDate(from.getDate() - 90);
        const to = new Date(start);
        to.setDate(to.getDate() + 90);
        const events = await getEvents(
          user.id,
          from.toISOString(),
          to.toISOString(),
        );
        bundle.related.calendarEvents = events.filter(
          (ev) =>
            ev.id !== body.eventId &&
            overlapAttendees(
              emails,
              ev.attendees?.map((a) => a.email) ?? [],
            ),
        );
      })(),
      (async () => {
        const { summary, sources, error } = await ctxSummaryForMeeting({
          title,
          attendeeEmails: emails,
          repos,
          streams,
        });
        if (error) {
          errors.ctx = error;
          return;
        }
        if (summary) {
          bundle.summary.purpose = summary;
          bundle.summary.sources.push("ctx");
          for (const src of sources) {
            bundle.links.push({
              label: src,
              url: `https://github.com/${src}`,
              type: "repo",
            });
          }
        }
      })(),
      (async () => {
        const { tasks, error } = await searchFlightdeckTasks({
          query: title,
          streams,
          participantEmails: emails,
          limit: 15,
        });
        if (error) errors.flightdeck = error;
        if (tasks.length > 0) {
          bundle.tasks.push(...tasks);
          return;
        }

        const tower = await towerSearchTasks({
          query: title,
          streams,
          participantEmails: emails,
          limit: 15,
        });
        if (tower.error) errors.tower = tower.error;
        bundle.tasks.push(
          ...tower.tasks.map((t) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            stream: t.stream,
            url: t.url,
            source: "tower" as const,
          })),
        );
      })(),
      (async () => {
        const krisp = await krispContextForMeeting(user.id, {
          title,
          start: body.start,
          attendeeEmails: emails,
        });
        if (krisp.error) errors.krisp = krisp.error;
        bundle.transcripts = krisp.transcripts;
        bundle.actions = krisp.actions;
        if (krisp.transcripts.length > 0) {
          bundle.summary.sources.push("transcript");
        }
      })(),
    ]);

    if (!bundle.summary.purpose) {
      const llm = await buildLlmSummary({
        title,
        description: body.description,
        people: bundle.people,
        deals: bundle.related.deals,
        transcriptExcerpt: bundle.transcripts[0]?.excerpt,
      });
      if (llm) {
        bundle.summary.purpose = llm;
        bundle.summary.sources.push("email");
      }
    }

    return NextResponse.json(bundle);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
