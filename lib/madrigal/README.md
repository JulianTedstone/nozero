# lib/madrigal — pipeline hub (nozero side)

The orchestration layer for the `npt-madrigal` autonomous job-application pipeline.
nozero is the **hub**: it already owns the integrations this pipeline needs —
`imap-sync` (the julian@nopilot.co monitor), `google-calendar` (the diary),
`hydration-client` (Twenty, via aqua), `flightdeck-client`, `ctx-gateway`
(gbrain), `onemin`/`ai-tools` (LLM). This module **orchestrates** them per stage.

## Files

| File | Role |
|---|---|
| `types.ts` | `MadrigalState`, `IdMapRow`, and the Activepieces `eventEnvelope` (zod). |
| `states.ts` | The status machine + `canTransition()`. |
| `id-map.ts` | CRUD over `madrigal.id_map` + `madrigal.events`; `setState()` = advance + log. |
| `twenty-mirror.ts` | Fail-safe, deferred opportunity sync to Twenty (clones the `crm-mirror.ts` contract). |
| `config.ts` | Loads the authoritative config from `context-message-madrigal/config/`. |

## Entry point

`app/api/madrigal/[stage]/route.ts` — Activepieces POSTs the event envelope to
`/api/madrigal/<stage>`; the handler authenticates (`MADRIGAL_WEBHOOK_SECRET`),
validates, and dispatches. Stages: intake · research · score · adapt · spec ·
submit · verify · finalize · follow-up.

## State

- **DB:** `madrigal` schema (`supabase/migrations/20260619000001_init_madrigal_schema.sql`).
  Service-role only. **Add `madrigal` to the project's PostgREST exposed schemas** (as for `nozero`).
- **Contracts of record:** `context-message-madrigal/contracts/` (id-map, form-spec, event envelope, docket API).
- **Config of record:** `context-message-madrigal/config/` (pipeline.yaml, rubric.yaml).

Status: **Phase 0 scaffold** — stubs only. Stage handlers land in Phase 1+.
New secret: `MADRIGAL_WEBHOOK_SECRET` (Activepieces ↔ nozero).
