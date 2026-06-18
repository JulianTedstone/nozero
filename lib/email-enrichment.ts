import "server-only";

import { oneMinComplete } from "@/lib/onemin";

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
  const prompt = `Write a one-sentence summary (max 25 words) of this email thread for a listing view.

Subject: ${input.subject}
Participants: ${input.participants.join(", ") || "unknown"}
Preview: ${input.snippet?.slice(0, 300) ?? "none"}

Return plain text only.`;

  try {
    const text = await oneMinComplete(prompt);
    if (!text) return null;
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
    const text = await oneMinComplete(prompt);
    if (!text) return null;
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
  const prompt = `In one sentence, state the original purpose and intent of this email thread.

Subject: ${input.subject}
Participants: ${input.participants.join(", ")}
Message summaries:
${input.summaries.slice(0, 5).join("\n")}

Return plain text only.`;

  try {
    const text = await oneMinComplete(prompt);
    if (!text) return null;
    return text.trim() || null;
  } catch {
    return null;
  }
}

export async function draftReplyForThread(input: {
  subject: string;
  persona?: string;
  threadMessages: Array<{ from: string; body: string; isMine?: boolean }>;
}): Promise<string | null> {
  const transcript = input.threadMessages
    .slice(-6)
    .map((m) => `${m.from}${m.isMine ? " (me)" : ""}:\n${m.body.slice(0, 1200)}`)
    .join("\n\n---\n\n");

  const agent = input.persona?.trim() || "Bertrand";
  const prompt = `You are ${agent}, drafting an email reply on the user's behalf.

Write a complete reply body only — no subject line, no markdown, no sign-off placeholders like [Your name].

Subject: ${input.subject}

Thread:
${transcript || "(empty thread)"}`;

  try {
    const text = await oneMinComplete(prompt);
    if (!text) return null;
    return text.trim() || null;
  } catch {
    return null;
  }
}
