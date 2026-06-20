#!/usr/bin/env node
/**
 * madrigal E2E driver — drives one sample role through every pipeline stage by
 * POSTing the event envelope to /api/madrigal/<stage>, the way Activepieces will.
 * It prints each stage's response so a human / Pierre can evaluate the run.
 *
 * This is the MECHANICAL backbone of the end-to-end test. The QUALITATIVE
 * evaluation (is the research sound? the cover letter good? the fit score fair?)
 * is what Pierre manages — see scripts/madrigal-e2e.README.md.
 *
 * Usage:
 *   NOZERO_BASE_URL=https://zero.nopilot.co \
 *   MADRIGAL_WEBHOOK_SECRET=... \
 *   node scripts/madrigal-e2e.mjs [--application <url>] [--jd <url>]
 *
 * Re-entrant stages (research/score/adapt/spec/verify) may need several passes;
 * pass --loop to re-run pending stages a few times.
 */

const BASE = (process.env.NOZERO_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const SECRET = process.env.MADRIGAL_WEBHOOK_SECRET || "";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const APPLICATION_URL = arg("application", "https://boards.greenhouse.io/example/jobs/000000");
const JD_URL = arg("jd", "https://example.com/careers/head-of-product");
const LOOP = process.argv.includes("--loop");

const ROLE_UID = "madrigal-e2e-acme-head-of-product-2026";
const COMPANY = "acme-e2e";
const ROLE_SLUG = "head-of-product";
const TITLE = "Head of Product";

// Stage order with the payload each needs. Only intake carries the seed fields.
const STAGES = [
  { stage: "intake", payload: { applicationUrl: APPLICATION_URL, jdUrl: JD_URL, companySlug: COMPANY, roleSlug: ROLE_SLUG, title: TITLE } },
  { stage: "research", payload: {} },
  { stage: "score", payload: {} },
  { stage: "gate", payload: {} },
  { stage: "adapt", payload: {} },
  { stage: "spec", payload: {} },
  { stage: "submit", payload: {} },
  { stage: "verify", payload: {} },
  { stage: "finalize", payload: {} },
  { stage: "follow-up", payload: {} },
];

// Statuses that mean "working as designed but not advancing" — not failures.
const GATED = new Set(["held", "pending", "skipped", "disqualified"]);

async function callStage(stage, payload) {
  const body = {
    role_uid: ROLE_UID,
    from_state: null,
    to_state: "to-do",
    actor: "e2e",
    ts: new Date().toISOString(),
    payload,
  };
  let res;
  try {
    res = await fetch(`${BASE}/api/madrigal/${stage}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-madrigal-secret": SECRET },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { httpOk: false, status: 0, json: { error: String(err) } };
  }
  const json = await res.json().catch(() => ({}));
  return { httpOk: res.ok, status: res.status, json };
}

function classify(stage, r) {
  if (!r.httpOk) return r.status === 501 ? "not-implemented" : `http-${r.status}`;
  const s = r.json.status || (r.json.ok ? "ok" : "unknown");
  if (GATED.has(s)) return `gated:${s}`;
  if (s === "failed" || r.json.error) return "fail";
  return `ok:${s}`;
}

async function main() {
  if (!SECRET) {
    console.error("MADRIGAL_WEBHOOK_SECRET is not set — the route will 401. Aborting.");
    process.exit(2);
  }
  console.log(`madrigal E2E -> ${BASE}  role_uid=${ROLE_UID}\n`);
  const results = [];
  for (const { stage, payload } of STAGES) {
    let r = await callStage(stage, payload);
    let verdict = classify(stage, r);
    // One retry for re-entrant stages that report pending/skipped.
    if (LOOP && verdict.startsWith("gated:") && ["research", "score", "adapt", "spec", "verify"].includes(stage)) {
      await new Promise((res) => setTimeout(res, 1500));
      r = await callStage(stage, payload);
      verdict = classify(stage, r);
    }
    results.push({ stage, verdict, status: r.status, body: r.json });
    console.log(`• ${stage.padEnd(10)} ${verdict.padEnd(18)} ${JSON.stringify(r.json)}`);
  }

  const fails = results.filter((r) => r.verdict === "fail" || r.verdict.startsWith("http-"));
  console.log(`\nSummary: ${results.length} stages, ${fails.length} hard failures.`);
  console.log("Gated (held/pending/skipped) is expected where a worker/secret is not live.");
  if (fails.length) {
    console.log("Failures:", fails.map((f) => `${f.stage}(${f.verdict})`).join(", "));
    process.exit(1);
  }
}

main();
