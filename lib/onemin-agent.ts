import "server-only";

import { oneMinComplete } from "@/lib/onemin";

/**
 * A minimal tool-calling agent over 1min.ai's plain completion API.
 *
 * 1min.ai has no native function-calling, so this drives a ReAct-style loop in
 * a single prompt: the model either emits a `TOOL_CALL {json}` line (which we
 * execute and feed back) or a plain-text final answer. It reuses the existing
 * AI-SDK `tool()` objects verbatim — their `.execute(args, {experimental_context})`
 * — and emits the same SSE events the chat client already consumes, so neither
 * the tools nor the client change.
 *
 * Fail-safe: a null/timeout completion ends the turn cleanly rather than hanging.
 */

export type AgentSseEvent =
  | { type: "text"; text: string }
  | { type: "tool-result"; toolName: string }
  | { type: "done"; didMutateCalendar: boolean }
  | { type: "error"; message: string };

// Structural shape of an AI-SDK tool object — only what the loop needs. The
// public `tools` param is `unknown`-valued to avoid coupling to the AI-SDK Tool
// type; each entry is narrowed to this at use.
interface AgentTool {
  description?: string;
  inputSchema?: unknown;
  execute?: (
    args: unknown,
    options: { experimental_context: { userId: string } },
  ) => Promise<unknown> | unknown;
}

interface ZodLike {
  shape?: Record<string, unknown>;
  safeParse?: (v: unknown) => { success: boolean; data?: unknown };
}

/** Best-effort parameter hint for the tool catalogue (never throws). */
function describeParams(schema: unknown): string {
  try {
    const shape = (schema as ZodLike | undefined)?.shape;
    if (!shape || Object.keys(shape).length === 0) {
      return "no arguments";
    }
    const fields = Object.entries(shape).map(([key, def]) => {
      const d = def as { description?: string; isOptional?: () => boolean };
      const optional = d?.isOptional?.() ? "?" : "";
      return `${key}${optional}${d?.description ? ` — ${d.description}` : ""}`;
    });
    return fields.join("; ");
  } catch {
    return "see description";
  }
}

/** Pull the first balanced JSON object out of a string. */
function firstJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  if (start === -1) {
    return null;
  }
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") {
      depth++;
    } else if (text[i] === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1)) as Record<string, unknown>;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function parseToolCall(
  reply: string,
): { tool: string; args: Record<string, unknown> } | null {
  const obj = firstJsonObject(reply);
  if (obj && typeof obj.tool === "string") {
    return {
      tool: obj.tool,
      args:
        obj.args && typeof obj.args === "object"
          ? (obj.args as Record<string, unknown>)
          : {},
    };
  }
  return null;
}

export async function runOneMinAgent(opts: {
  system: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  tools: Record<string, unknown>;
  userId: string;
  mutatingTools?: string[];
  maxSteps?: number;
  model?: string;
  emit: (event: AgentSseEvent) => void;
}): Promise<void> {
  const maxSteps = opts.maxSteps ?? 6;
  const mutating = new Set(opts.mutatingTools ?? []);

  const catalogue = Object.entries(opts.tools)
    .map(([name, raw]) => {
      const t = raw as AgentTool;
      return `- ${name}(${describeParams(t.inputSchema)}): ${t.description ?? ""}`;
    })
    .join("\n");

  const guide = `${opts.system}

You can use tools to read or change the user's calendar. Available tools:
${catalogue}

RULES:
- To use a tool, reply with ONLY one line and nothing else:
  TOOL_CALL {"tool":"<name>","args":{ ... }}
- Use ISO dates/datetimes for date arguments.
- Before creating an event, check for conflicts first.
- When you have enough information, reply to the user in plain, concise prose — no JSON, no TOOL_CALL.`;

  const transcript: string[] = opts.history.map(
    (m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`,
  );

  let didMutate = false;
  let answered = false;

  for (let step = 0; step < maxSteps; step++) {
    const prompt = `${guide}\n\n${transcript.join("\n")}\n\nAssistant:`;
    const reply = await oneMinComplete(prompt, {
      model: opts.model,
      timeoutMs: 25_000,
    });
    if (!reply) {
      break;
    }

    const call = parseToolCall(reply);
    if (!call) {
      opts.emit({ type: "text", text: reply.trim() });
      answered = true;
      break;
    }

    const tool = opts.tools[call.tool] as AgentTool | undefined;
    if (!tool || typeof tool.execute !== "function") {
      transcript.push(`Assistant: TOOL_CALL ${JSON.stringify(call)}`);
      transcript.push(`Tool error: no such tool "${call.tool}".`);
      continue;
    }

    let output: unknown;
    try {
      output = await tool.execute(call.args, {
        experimental_context: { userId: opts.userId },
      });
    } catch (err) {
      output = {
        success: false,
        error: err instanceof Error ? err.message : "Tool execution failed",
      };
    }

    if (mutating.has(call.tool)) {
      didMutate = true;
    }
    opts.emit({ type: "tool-result", toolName: call.tool });
    transcript.push(`Assistant: TOOL_CALL ${JSON.stringify(call)}`);
    transcript.push(
      `Tool result (${call.tool}): ${JSON.stringify(output).slice(0, 2000)}`,
    );
  }

  // Ran out of steps mid-work — ask once for a plain-language wrap-up.
  if (!answered) {
    const summary = await oneMinComplete(
      `${guide}\n\n${transcript.join("\n")}\n\nReply to the user now in plain prose only (no tools, no JSON), summarising what you did or found.\n\nAssistant:`,
      { model: opts.model, timeoutMs: 20_000 },
    );
    opts.emit({
      type: "text",
      text: summary?.trim() || "Done.",
    });
  }

  opts.emit({ type: "done", didMutateCalendar: didMutate });
}
