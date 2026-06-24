# madrigal E2E test — managed by Pierre

The only real way to evaluate the madrigal pipeline is to run a ticket end to end
and judge the outputs. This is the brief for **Pierre** to manage that run.
`madrigal-e2e.mjs` is the mechanical backbone; Pierre supplies the judgement.

## Prerequisites (per stage)

| Needs | For stages |
|---|---|
| nozero deployed + `MADRIGAL_WEBHOOK_SECRET` set | all |
| Supabase `madrigal` schema applied + exposed to PostgREST | all (id_map/events) |
| `github-content` token (writes to context-message-madrigal) | intake, research, score, adapt, spec, finalize, follow-up |
| hermes-webui reachable (`NOZERO_HERMES_*`) | research, score, adapt, spec |
| studio-runner live (#110) + `NOZERO_STUDIO_*` + `config.docket.publish=true` | adapt (PDF + gallery publish) |
| gallery auth (`NOZERO_GALLERY_*`, nopilot-co-www) | adapt (publish) |
| camouflex live (#112) + `config.submission.autoSubmit=true` | submit |
| ack ingestor writing `meta.ackEmail` | verify |
| npt-aqua #85 (Twenty live sync) | finalize/reconciler (real mirror) |
| madrigal Google Calendar identity bound | follow-up (real reminders) |

Anything not live shows as **gated** (`held` / `pending` / `skipped`) — that is
expected, not a failure. The dry path (intake → research → score → gate → adapt →
spec) is exercisable as soon as nozero + supabase + hermes are up.

## Mechanical run

```bash
NOZERO_BASE_URL=https://zero.nopilot.co \
MADRIGAL_WEBHOOK_SECRET=… \
node scripts/madrigal-e2e.mjs --application <apply-url> --jd <jd-url> --loop
```

It drives the sample role through every stage and prints each response + a
pass/fail summary (`role_uid = madrigal-e2e-acme-head-of-product-2026`).

## What Pierre manages (the judgement)

1. **Pick a real (or representative) role** — a genuine application + JD link.
2. **Drive the stages** (script or by hand) and, at each, open the artefacts in
   `context-message-madrigal/search/roles/<slug>/` and evaluate:
   - **research** — is `research.md` accurate, sourced, non-hallucinated?
   - **score** — is the fit score + rationale defensible against the rubric?
   - **gate** — correct branch vs the threshold?
   - **adapt** — is `cover-letter.md` specific and in Ted's voice (not generic)? CV tailoring sensible?
   - **spec** — does `form-spec.yaml` carry the right answers; are generated fields flagged with confidence?
3. **Stop at the burn-in wall**: submit must stay **held** (`auto_submit=false`).
   Do NOT flip it live until the dry path passes repeatedly.
4. **Report** to the Flightdeck ticket: per-stage verdict, defects, and a
   go/no-go on advancing burn-in. Escalate anything `needs-human`.

## Pass / fail

- **Pass (dry path):** intake→spec all `ok`, artefacts present and good quality,
  state machine transitions correct in `madrigal.id_map` + `events`.
- **Fail:** any hard HTTP error, a hallucinated/empty artefact, a wrong state
  transition, or a gate mis-branch.

Full-path pass additionally needs #110 + #112 live and a supervised real submit.
