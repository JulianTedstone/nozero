import "server-only";

/**
 * Hermes client — talks to the running hermes-webui (the agent powering the
 * bertrand stack on jupiter). Cookie-auth + synchronous session/chat:
 *   POST /api/auth/login {password}        -> Set-Cookie: hermes_session=...
 *   POST /api/sessions {workspace, model…}  -> { session: { session_id } }
 *   POST /api/chat {session_id, message}     -> { answer }
 *
 * /api/chat is SYNCHRONOUS — it blocks until the agent replies (can be minutes).
 * Fail-safe: unconfigured / unreachable / empty returns null; the caller treats
 * a null result as "no result". Harden to streaming/async later.
 */
const HERMES_URL = process.env.NOZERO_HERMES_API_URL || "http://127.0.0.1:8787";
const AUTH_TIMEOUT_MS = 30_000;
const CHAT_TIMEOUT_MS = 300_000;

const SESSION_BODY = {
  model: "",
  model_provider: "auto",
  workspace: "/workspace",
};

// Session cookie cached across calls within the process.
let cookie: string | null = null;

export function hermesConfigured(): boolean {
  return Boolean(process.env.NOZERO_HERMES_WEBUI_PASSWORD);
}

async function post(
  path: string,
  body: unknown,
  timeoutMs: number,
  authed: boolean
): Promise<Response | null> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (authed && cookie) {
    headers.Cookie = `hermes_session=${cookie}`;
  }
  try {
    return await fetch(`${HERMES_URL}${path}`, {
      body: JSON.stringify(body),
      headers,
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return null;
  }
}

async function login(): Promise<boolean> {
  const password = process.env.NOZERO_HERMES_WEBUI_PASSWORD;
  if (!password) {
    return false;
  }
  const res = await post(
    "/api/auth/login",
    { password },
    AUTH_TIMEOUT_MS,
    false
  );
  if (!res?.ok) {
    return false;
  }
  const match = res.headers.get("set-cookie")?.match(/hermes_session=([^;]+)/);
  if (match) {
    cookie = match[1];
    return true;
  }
  return false;
}

/**
 * One agent turn: ensure auth, open a session, send the message, return the
 * `answer` text. Re-logs in once on a 401. Null on any failure / unconfigured.
 */
export async function hermesChat(input: {
  message: string;
  instructions?: string;
}): Promise<string | null> {
  if (!hermesConfigured()) {
    return null;
  }
  if (!(cookie || (await login()))) {
    return null;
  }

  let sres = await post("/api/session/new", SESSION_BODY, AUTH_TIMEOUT_MS, true);
  if (sres?.status === 401 && (await login())) {
    sres = await post("/api/session/new", SESSION_BODY, AUTH_TIMEOUT_MS, true);
  }
  if (!sres?.ok) {
    return null;
  }
  const sessionId = (
    (await sres.json()) as { session?: { session_id?: string } }
  ).session?.session_id;
  if (!sessionId) {
    return null;
  }

  const message = input.instructions
    ? `${input.instructions}\n\n${input.message}`
    : input.message;
  const cres = await post(
    "/api/chat",
    { message, session_id: sessionId },
    CHAT_TIMEOUT_MS,
    true
  );
  if (!cres?.ok) {
    return null;
  }
  const answer = ((await cres.json()) as { answer?: string }).answer;
  return typeof answer === "string" && answer.trim() ? answer.trim() : null;
}
