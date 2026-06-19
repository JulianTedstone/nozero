import "server-only";

/**
 * Hermes agent HTTP client. Hermes runs the intelligent pipeline stages
 * (research, scoring) through its async run API — POST a task, poll the run_id.
 * Internally hermes uses its own toolsets + agent_dispatch (research/browse), so
 * nozero only has to submit work and collect the result.
 *
 * Fail-safe like nozero's other links: unconfigured/unreachable returns null;
 * the caller decides how to handle a missing result (retry / needs-human).
 *
 * Runs take minutes, so stages submit then poll (re-entrant) rather than waiting
 * inline. `runHermesTask` (submit + bounded wait) exists only for short tasks/tests.
 */
const HERMES_URL = process.env.HERMES_API_URL || "http://localhost:8642";
const POLL_INTERVAL_MS = 3000;
const REQUEST_TIMEOUT_MS = 20_000;
const DEFAULT_WAIT_MS = 180_000;

const TERMINAL = new Set(["completed", "failed", "cancelled"]);

export function hermesConfigured(): boolean {
  return Boolean(process.env.HERMES_API_KEY);
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.HERMES_API_KEY ?? ""}`,
    "Content-Type": "application/json",
  };
}

export interface HermesRun {
  error?: string;
  output?: string;
  runId: string;
  status: string; // running | completed | failed | cancelled
}

export function isTerminal(status: string): boolean {
  return TERMINAL.has(status);
}

/** Submit an async run. Returns the run_id, or null if unconfigured/unreachable. */
export async function submitHermesRun(input: {
  task: string;
  instructions?: string;
  sessionId?: string;
}): Promise<string | null> {
  if (!hermesConfigured()) {
    return null;
  }
  try {
    const res = await fetch(`${HERMES_URL}/v1/runs`, {
      body: JSON.stringify({
        input: input.task,
        instructions: input.instructions,
        model: "hermes-agent",
        session_id: input.sessionId,
      }),
      headers: headers(),
      method: "POST",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (res.status !== 202) {
      return null;
    }
    const data = (await res.json()) as { run_id?: string };
    return data.run_id ?? null;
  } catch {
    return null;
  }
}

/** Fetch one run's current status/output. Null on unreachable. */
export async function getHermesRun(runId: string): Promise<HermesRun | null> {
  try {
    const res = await fetch(
      `${HERMES_URL}/v1/runs/${encodeURIComponent(runId)}`,
      { headers: headers(), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }
    );
    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as {
      error?: string;
      output?: string;
      run_id?: string;
      status?: string;
    };
    return {
      error: data.error,
      output: data.output,
      runId: data.run_id ?? runId,
      status: data.status ?? "running",
    };
  } catch {
    return null;
  }
}

/**
 * Submit + bounded-wait for a terminal run. For SHORT tasks and tests only;
 * long stages submit then poll via the bus. Returns the terminal run, or null
 * on timeout / unreachable.
 */
export async function runHermesTask(input: {
  task: string;
  instructions?: string;
  waitMs?: number;
}): Promise<HermesRun | null> {
  const runId = await submitHermesRun(input);
  if (!runId) {
    return null;
  }
  const deadline = Date.now() + (input.waitMs ?? DEFAULT_WAIT_MS);
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const run = await getHermesRun(runId);
    if (run && isTerminal(run.status)) {
      return run;
    }
  }
  return null;
}
