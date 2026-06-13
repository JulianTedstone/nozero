import "server-only";

import { generateText } from "ai";
import { getOpenRouterModel } from "@/lib/openrouter";

export interface MessageAiSummary {
  previousContext: string | null;
  summary: string;
  actions: Array<{ action: string; owner: string | null }>;
  suggestedResponse: string | null;
}

export async function summarizeThread(input: {
  subject: string;
  participants: string[];
  snippet?: string | null;
}): Promise<string | null> {
  if (!process.env.OPENROUTER_API_KEY) return null;

  const prompt = `Write a one-sentence summary (max 25 words) of this email thread for a listing view.

Subject: ${input.subject}
Participants: ${input.participants.join(", ") || "unknown"}
Preview: ${input.snippet?.slice(0, 300) ?? "none"}

Return plain text only.`;

  try {
    const { text } = await generateText({
      model: getOpenRouterModel(),
      prompt,
      maxTokens: 80,
    });
    return text.trim() || null;
  } catch {
    return null;
  }
}

export async function summarizeMessage(input: {
  subject: string;
  from: string;
  bodyPlain: string;
  priorMessages?: string[];
}): Promise<MessageAiSummary | null> {
  if (!process.env.OPENROUTER_API_KEY) return null;

  const prior =
    input.priorMessages?.slice(-3).join("\n---\n") || "None (first message)";

  const prompt = `Analyze this email message in a thread. Return JSON only with keys:
- previousContext: string (1 sentence on prior thread context, or null if first)
- summary: string (1-2 sentences on this message)
- actions: array of { "action": string, "owner": string|null }
- suggestedResponse: string|null (brief draft reply angle, or null)

Subject: ${input.subject}
From: ${input.from}
Prior messages context:
${prior}

Message body:
${input.bodyPlain.slice(0, 3500)}`;

  try {
    const { text } = await generateText({
      model: getOpenRouterModel(),
      prompt,
      maxTokens: 400,
    });
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as MessageAiSummary;
    if (!parsed.summary) return null;
    return {
      previousContext: parsed.previousContext ?? null,
      summary: parsed.summary,
      actions: Array.isArray(parsed.actions) ? parsed.actions : [],
      suggestedResponse: parsed.suggestedResponse ?? null,
    };
  } catch {
    return null;
  }
}

export async function inferThreadIntent(input: {
  subject: string;
  participants: string[];
  summaries: string[];
}): Promise<string | null> {
  if (!process.env.OPENROUTER_API_KEY) return null;

  const prompt = `In one sentence, state the original purpose and intent of this email thread.

Subject: ${input.subject}
Participants: ${input.participants.join(", ")}
Message summaries:
${input.summaries.slice(0, 5).join("\n")}

Return plain text only.`;

  try {
    const { text } = await generateText({
      model: getOpenRouterModel(),
      prompt,
      maxTokens: 100,
    });
    return text.trim() || null;
  } catch {
    return null;
  }
}
