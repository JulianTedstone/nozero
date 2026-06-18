import "server-only";

/**
 * 1min.AI chat client — nozero's LLM provider.
 *
 * 1min.AI is not OpenAI-compatible: it uses a native endpoint
 * (`/api/chat-with-ai`), an `API-KEY` header, a `{type, model, promptObject}`
 * body, and returns the answer at `aiRecord.aiRecordDetail.resultObject`.
 *
 * Like the rest of nozero's external links, this is fail-safe: a missing key,
 * timeout, or error returns null rather than throwing, so an LLM hiccup never
 * breaks a request — callers already treat a null completion as "no result".
 */

const ONEMIN_URL = "https://api.1min.ai/api/chat-with-ai";
const DEFAULT_MODEL = process.env.NOZERO_ONEMIN_MODEL || "gpt-4o-mini";
const DEFAULT_TIMEOUT_MS = 30_000;

export function oneMinConfigured(): boolean {
  return Boolean(process.env.NOZERO_ONEMINAI_API_KEY);
}

/** Single-turn completion. Returns the answer text, or null on any failure. */
export async function oneMinComplete(
  prompt: string,
  opts?: { model?: string; timeoutMs?: number; webSearch?: boolean },
): Promise<string | null> {
  const apiKey = process.env.NOZERO_ONEMINAI_API_KEY;
  if (!apiKey || !prompt.trim()) {
    return null;
  }

  try {
    const res = await fetch(ONEMIN_URL, {
      method: "POST",
      headers: { "API-KEY": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "UNIFY_CHAT_WITH_AI",
        model: opts?.model || DEFAULT_MODEL,
        promptObject: {
          prompt,
          ...(opts?.webSearch
            ? { settings: { webSearchSettings: { webSearch: true } } }
            : {}),
        },
      }),
      signal: AbortSignal.timeout(opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as {
      aiRecord?: { aiRecordDetail?: { resultObject?: string[] | string } };
    };
    const result = data.aiRecord?.aiRecordDetail?.resultObject;
    const text = Array.isArray(result) ? result.join("") : (result ?? "");
    return text.trim() || null;
  } catch {
    return null;
  }
}
