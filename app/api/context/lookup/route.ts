import "server-only";

import { generateText } from "ai";
import { getOpenRouterModel } from "@/lib/openrouter";
import { searchSomaContactsByEmail } from "@/lib/soma-client";

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

async function fetchSomaContext(
  participants: string[],
  title: string
): Promise<string> {
  const somaUrl = process.env.NOZERO_SOMA_ANANSI_URL;
  const somaKey = process.env.NOZERO_SOMA_ANANSI_SECRET_API_KEY;
  if (!somaUrl || !somaKey || participants.length === 0) return "";

  try {
    const results = await Promise.allSettled(
      participants.map((email) => searchSomaContactsByEmail(email))
    );

    const found = results
      .filter((r): r is PromiseFulfilledResult<unknown> => r.status === "fulfilled" && r.value != null)
      .map((r) => r.value);

    if (found.length > 0) {
      return `Soma CRM data:\n${JSON.stringify(found, null, 2)}`;
    }

    const dealRes = await fetch(`${somaUrl}/api/deals/search?q=${encodeURIComponent(title)}`, {
      headers: { Authorization: `Bearer ${somaKey}` },
      signal: AbortSignal.timeout(4000),
    });
    if (dealRes.ok) {
      const deals = await dealRes.json();
      if (deals?.length > 0) {
        return `Soma deals:\n${JSON.stringify(deals, null, 2)}`;
      }
    }
  } catch {
    // soma unavailable
  }
  return "";
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

export async function POST(request: Request) {
  const { title, participants = [], startDate } = (await request.json()) as {
    title?: string;
    participants?: string[];
    startDate?: string;
  };

  if (!title?.trim() && participants.length === 0) {
    return Response.json(emptyResult([]));
  }

  const somaContext = await fetchSomaContext(participants, title ?? "");
  const somaBase = process.env.NOZERO_SOMA_ANANSI_URL ?? "https://soma.nopilot.co";

  const prompt = `You are a meeting preparation assistant for NoPilot. Given a meeting title and participants, synthesize context.

Meeting title: "${title || "Untitled"}"
Participants: ${participants.length > 0 ? participants.join(", ") : "none"}
Date: ${startDate || "unspecified"}
${somaContext ? `\n${somaContext}\n` : ""}

Return ONLY valid JSON matching this exact shape (no markdown fences):
{
  "background": "<1–2 sentences on likely meeting purpose, or null>",
  "participants": [
    {
      "email": "<email>",
      "name": "<full name or null>",
      "company": "<company name or null>",
      "role": "<job title or null>",
      "somaContactId": "<soma contact id or null>",
      "somaCompanyId": "<soma company id or null>"
    }
  ],
  "deals": [
    { "name": "<deal name>", "stage": "<stage or null>", "value": "<formatted value or null>", "id": "<id or null>" }
  ],
  "desiredOutput": "<what this meeting should produce, or null>",
  "links": [
    { "label": "<label>", "url": "<url>", "type": "contact|company|deal|general" }
  ]
}

Rules:
- One participant object per email address.
- If you have soma IDs, build links: contacts → ${somaBase}/contacts/<id>, companies → ${somaBase}/companies/<id>.
- If no information is known for a field, use null or [].
- Be concise. Background ≤ 40 words. desiredOutput ≤ 20 words.`;

  try {
    const { text } = await generateText({
      model: getOpenRouterModel(),
      prompt,
      maxTokens: 600,
    });

    // Strip possible markdown fences
    const cleaned = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    const parsed = JSON.parse(cleaned) as LookupResult;
    return Response.json(parsed);
  } catch {
    return Response.json(emptyResult(participants));
  }
}
