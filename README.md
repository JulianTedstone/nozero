# nozero

AI-powered scheduling with natural language event creation, Google Calendar sync, invite emails, and analytics built on Next.js and Supabase.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/JulianTedstone/nozero&project-name=nozero&repository-name=nozero)

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

Create `.env.local` and set the values your deployment needs:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_DB_URL=                  # postgres://… (session pooler) — used by `bun run types:gen`

SITE_URL=http://localhost:3000
NEXT_PUBLIC_SITE_URL=http://localhost:3000

OPENROUTER_API_KEY=
OPENROUTER_MODEL=x-ai/grok-4.1-fast

RESEND_API_KEY=
RESEND_FROM_EMAIL="nozero <email@here.com>"
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
| `RESEND_API_KEY` | Yes | API key used to send invitation emails. |
| `RESEND_FROM_EMAIL` | Optional | Sender identity for invitation emails. |

## Deploying to Vercel

The deploy button above clones this repository into a new Vercel project. Before the app is usable, make sure you also:

1. Create or connect a Supabase project; apply `supabase/migrations/*.sql`.
2. Add the environment variables listed above in Vercel.
3. Configure the Google provider in the Supabase Auth dashboard (client ID + secret + redirect URI).
4. Configure Resend if you want invitation emails enabled.


## License

MIT
