# nozero

AI-powered scheduling with natural language event creation, Google Calendar sync, invite emails, and analytics built on Next.js and Supabase.

Deployed to **Hetzner** (Docker + Caddy) at `https://zero.nopilot.co` — see [Deploying to Hetzner](#deploying-to-hetzner).

## Features

- Natural-language scheduling and calendar actions
- Google Calendar sync and webhook-based updates
- Invite flows with email delivery through Resend
- Calendar analytics, conflict detection, and free-time discovery
- Supabase Auth (Google provider) with `nozero` schema + RLS
- Modern Next.js App Router UI

## Stack

- Next.js 16
- React 19
- Bun
- Supabase (Postgres, Auth, Realtime) — `nozero` schema
- OpenRouter AI SDK
- Resend

## Quick start

### 1. Install dependencies

```bash
bun install
```

### 2. Create your environment file

Copy the committed template and inject secrets from 1Password (`nopilot.nozero` + `nopilot.tower` vaults):

```bash
op inject -i .env.tpl -o .env.local
```

For production on Hetzner, use the same template with production URLs:

```bash
SITE_URL=https://zero.nopilot.co
NEXT_PUBLIC_SITE_URL=https://zero.nopilot.co
```

Or maintain a host `.env` with `op inject -i .env.tpl -o .env` after setting those two lines in `.env.tpl` or exporting overrides.

Manual setup (without 1Password) — set values your deployment needs:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_DB_URL=                  # postgres://… (session pooler) — used by `bun run types:gen`

SITE_URL=http://localhost:3000
NEXT_PUBLIC_SITE_URL=http://localhost:3000

OPENROUTER_API_KEY=
OPENROUTER_MODEL=x-ai/grok-4.1-fast

# Invite emails via the MXroute SMTP API (https://smtpapi.mxroute.com/)
MXROUTE_SMTP_SERVER=chocobo.mxrouting.net
MXROUTE_SMTP_USERNAME=                  # full mailbox address used to authenticate
MXROUTE_SMTP_PASSWORD=
MXROUTE_FROM_EMAIL=julian@nopilot.co
```

Google OAuth is configured in the Supabase dashboard (Auth → Providers → Google), not in the app env. The Supabase redirect URI is `https://<project>.supabase.co/auth/v1/callback`. The app's `/auth/callback` route exchanges the code for a session and captures `provider_token` + `provider_refresh_token` into `nozero.profiles`.

### 3. Apply the schema

```bash
psql "$SUPABASE_DB_URL" -f supabase/migrations/20260605000001_init_nozero_schema.sql
```

### 4. Generate TypeScript types

```bash
bun run types:gen
```

### 5. Start the app

```bash
bun dev
```

Open http://localhost:3000.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL (browser + server). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Anon/publishable key used by browser + server SSR clients. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service-role key used by the server-only admin client (invitations, webhook handlers, OAuth callback). Never ship to the browser. |
| `SUPABASE_DB_URL` | Dev only | Postgres URL for `supabase gen types` and migrations. Use the session pooler. |
| `SITE_URL` | Yes | Canonical server-side site URL. |
| `NEXT_PUBLIC_SITE_URL` | Yes | Public site URL used by the client and invitation links. |
| `OPENROUTER_API_KEY` | Yes | API key for AI-powered scheduling features. |
| `OPENROUTER_MODEL` | Optional | Override the default OpenRouter model. |
| `MXROUTE_SMTP_SERVER` | For emails | MXroute mail host, e.g. `chocobo.mxrouting.net`. |
| `MXROUTE_SMTP_USERNAME` | For emails | Full mailbox address used to authenticate to the MXroute SMTP API. |
| `MXROUTE_SMTP_PASSWORD` | For emails | That mailbox's password. |
| `MXROUTE_FROM_EMAIL` | Optional | Sender address (defaults to `julian@nopilot.co`). |
| `NOZERO_SOMA_ANANSI_URL` / `NOZERO_SOMA_ANANSI_SECRET_API_KEY` | Context/email | Soma access (`nopilot.nozero.SOMA_ACCESS`). |
| `NOZERO_SESSION_SECRET` | Yes | HMAC secret for OAuth state (Google/Krisp connect). |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Optional | Linked Google account connect (separate from Supabase Auth). |
| `GITHUB_TOKEN` | Flightdeck board | Read-only GitHub token for Project #17 kanban. |
| `FLIGHTDECK_PROJECT_OWNER` / `FLIGHTDECK_PROJECT_NUMBER` | Flightdeck board | GitHub project metadata (`nopilot.tower` vault). |
| `NOZERO_TOWER_API_KEY` | Tower gateway | Bearer token for Tower MCP HTTP API (Bertrand actor). |
| `NOZERO_CTX_GATEWAY_URL` / `NOZERO_CTX_API_KEY` | Context index | gbrain MCP at `https://ctx.nopilot.services/sse`; server uses `nozero` actor token (`nopilot.agents.GBRAIN_CTX_TOKEN`). |
| `KRISP_MCP_*` / `KRISP_OAUTH_*` | Krisp | OAuth client + endpoints for meeting transcripts (`nopilot.nozero.KRISP`). |

Use `.env.tpl` + `op inject` for all of the above except optional overrides (`SITE_URL`, `OPENROUTER_MODEL`, `SUPABASE_DB_URL`).

## Deploying to Hetzner

nozero is **not a Vercel app.** It runs as a standalone Next.js container (`output: 'standalone'`)
on the shared nopilot Hetzner box ("jupiter"), behind the existing **host-level Caddy** that
owns `:80`/`:443` and fronts the other nopilot services. Caddy reverse-proxies
`zero.nopilot.co` to the `nozero-web` container and handles TLS — the same pattern as
`nopilot-co-www` (see that repo's `DEPLOY.md`).

Before the app is usable on the box, make sure you also:

1. Create or connect a Supabase project; apply `supabase/migrations/*.sql`.
2. Set the environment variables listed above in the host `.env` (with `SITE_URL` /
   `NEXT_PUBLIC_SITE_URL` = `https://zero.nopilot.co`).
3. Add a `zero.nopilot.co { reverse_proxy nozero-web:3000 }` site block to the host Caddy
   config and reload it.
4. Resolve TLS for the proxied (Cloudflare) record — either grey-cloud `zero.nopilot.co` so
   Caddy can complete ACME, or install the Cloudflare Origin certificate (same approach the
   other nopilot hostnames use).
5. Configure the Google provider in the Supabase Auth dashboard (client ID + secret + redirect URI).
6. Configure Resend if you want invitation emails enabled.

> The deploy artifacts (`Dockerfile`, `docker-compose.host.yml`, host-Caddy snippet, CI workflow)
> still need to be added to this repo, mirroring `nopilot-co-www`.


## License

MIT
