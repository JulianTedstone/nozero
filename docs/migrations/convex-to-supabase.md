# Migration: Convex → Supabase

> **Superseded for production.** aqua-npt now runs on Supabase **gily** (`gilyyzjsasyhrwterjor.supabase.co`), schema `nozero`. See `~/aqua/aqua-context/GILY-AUDIT.md` and `AQUA.md`. This doc is kept for historical Convex→Postgres mapping only.

Status: COMPLETE (Convex removed); original target project `hzzojgkumgqzurjtnaud` was never used for aqua deploy.
Owner: @JulianTedstone.
Runtime target: `nozero` schema on **gily**.

## Decisions

| # | Choice | Rationale |
|---|---|---|
| Auth | **Supabase Auth** (drop Better Auth + `@convex-dev/better-auth`) | Single stack; native Google OAuth provider; RLS via `auth.uid()`. |
| Schema location | **Dedicated `nozero` schema** in shared NOPILOT Supabase | No new project to provision; isolation via Postgres schema + RLS. |
| Realtime | **Full parity** — subscribe all four tables | Match current Convex auto-reactive UX. |

## Surface to migrate

Backend (delete after Phase 7):
- `convex/schema.ts`, `convex/auth.ts`, `convex/auth.config.ts`, `convex/convex.config.ts`
- `convex/http.ts`, `convex/access.ts`
- `convex/users.ts`, `convex/events.ts`, `convex/categories.ts`, `convex/invitations.ts`
- `convex/_generated/*` (auto)

Client glue (rewrite):
- `lib/convex.ts` → `lib/supabase/server.ts` + `lib/supabase/browser.ts`
- `lib/auth-server.ts`, `lib/auth-client.ts` → `lib/supabase/auth.ts` (helpers around `@supabase/ssr`)
- `components/session-provider.tsx` → Supabase session context

Callers (rewrite query/mutation paths):
- `app/api/calendar/sync/route.ts`, `app/api/calendar/events/route.ts`
- `app/api/calendars/google-list/route.ts`
- `app/api/invitations/{send,respond,details}/route.ts`
- `lib/calendar-google-sync-server.ts`, `lib/store.ts`

Auth pages (rewrite for Supabase Auth flow):
- `app/auth/signin/*`, `app/auth/signup/*` (audit during Phase 3)

## Data model translation

All tables live in `nozero.*`. RLS enabled. `user_id uuid references auth.users(id) on delete cascade`. `created_at timestamptz default now()`. Convex `_id` → Postgres `id uuid default gen_random_uuid()`.

### `nozero.profiles` (was `users`)

Convex `users.userId: string` (Better Auth user id) becomes `auth.users.id` (uuid). The application-level extension lives in `profiles`.

```sql
create table nozero.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  image text,
  provider text,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  preferences jsonb,
  last_google_sync timestamptz,
  google_sync_token text,
  google_watch_calendar_id text,
  google_watch_channel_id text unique,
  google_watch_expiration timestamptz,
  google_watch_resource_id text,
  google_watch_token text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Notes:
- `epochMs` numbers in Convex → `timestamptz` here. Boundary code converts at the edges.
- Google watch channel must remain unique — keep the `unique` constraint.
- OAuth tokens stored server-side only; client policy excludes `access_token`/`refresh_token` columns.

### `nozero.events`

```sql
create table nozero.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id text not null,                  -- client/Google-provided event id
  start_at timestamptz not null,
  end_at timestamptz not null,
  source text,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, event_id)
);
create index events_user_id_idx on nozero.events(user_id);
create index events_user_time_idx on nozero.events(user_id, start_at);
```

### `nozero.categories`

```sql
create table nozero.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category_id)
);
create index categories_user_id_idx on nozero.categories(user_id);
```

### `nozero.invitations`

```sql
create table nozero.invitations (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  event_id text not null,
  organizer_user_id uuid not null references auth.users(id) on delete cascade,
  organizer_name text not null,
  organizer_email text not null,
  invitee_email text not null,
  event_title text not null,
  event_start timestamptz not null,
  event_end timestamptz not null,
  event_location text,
  event_calendar_id text,
  status text not null,                    -- pending|accepted|declined|tentative
  responded_at timestamptz,
  created_at timestamptz not null default now()
);
create index invitations_event_id_idx on nozero.invitations(event_id);
create index invitations_invitee_email_idx on nozero.invitations(invitee_email);
create unique index invitations_event_invitee_uidx on nozero.invitations(event_id, invitee_email);
```

### RLS policies (sketch)

```sql
alter table nozero.profiles enable row level security;
alter table nozero.events enable row level security;
alter table nozero.categories enable row level security;
alter table nozero.invitations enable row level security;

-- profiles: own row only (token columns hidden via column-level grant)
create policy profiles_self on nozero.profiles for all using (id = auth.uid());

-- events / categories: own rows
create policy events_self on nozero.events for all using (user_id = auth.uid());
create policy categories_self on nozero.categories for all using (user_id = auth.uid());

-- invitations: organizer sees own; invitee sees by email match; public can read by token (for invite landing page)
create policy invitations_organizer on nozero.invitations for all using (organizer_user_id = auth.uid());
create policy invitations_invitee on nozero.invitations for select using (
  invitee_email = (auth.jwt() ->> 'email')
);
-- public read by token handled via SECURITY DEFINER RPC (avoid exposing the whole table).
```

Service-role usage is reserved for: invitation sends, Google calendar webhook handlers, token rotation. RLS bypass on service paths only.

## Realtime

Per the full-parity decision, subscribe to all four tables via Supabase Realtime (Postgres logical replication):

```ts
supabase
  .channel(`profiles:${userId}`)
  .on('postgres_changes', { event: '*', schema: 'nozero', table: 'profiles', filter: `id=eq.${userId}` }, handler)
  .subscribe();
```

The `realtime` publication must include the four tables: `alter publication supabase_realtime add table nozero.profiles, nozero.events, nozero.categories, nozero.invitations;`

Client-side hook layer wraps TanStack Query so existing call sites see `useEvents()`/`useCategories()` etc. with the same loading/data shape Convex returned.

## Env vars (Phase 1 target)

`.env.local` (gitignored, derived from existing `.env` + dashboard):

```
NEXT_PUBLIC_SUPABASE_URL=$NOPILOT_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$NOPILOT_SUPABASE_PUB_API_KEY
SUPABASE_SERVICE_ROLE_KEY=$NOPILOT_SUPABASE_SECRET_API_KEY
SUPABASE_DB_URL=postgres://$NOPILOT_SUPABASE_POSTGRES_USER:$NOPILOT_SUPABASE_POSTGRES_PASSWORD@db.hzzojgkumgqzurjtnaud.supabase.co:5432/postgres

SITE_URL=http://localhost:3000
NEXT_PUBLIC_SITE_URL=http://localhost:3000

OPENROUTER_API_KEY=$NOPILOT_OPENROUTER_API_KEY
OPENROUTER_MODEL=x-ai/grok-4.1-fast

# Google OAuth is configured in Supabase Auth dashboard, not in app env (Supabase brokers the flow).
# Resend (out of scope for this migration — invitations email):
RESEND_API_KEY=...
RESEND_FROM_EMAIL="nozero <noreply@nozero.app>"
```

Dropped: `NEXT_PUBLIC_CONVEX_URL`, `CONVEX_URL`, `CONVEX_SITE_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (latter two move to Supabase dashboard config).

## Phasing

Each phase is one PR.

1. **Plumbing** — install `@supabase/supabase-js` + `@supabase/ssr`; add `lib/supabase/{server,browser,admin}.ts`; `.env.local`; types script. App still boots against Convex.
2. **Schema** — apply DDL above as a Supabase migration; turn on RLS; add `realtime` publication; generate TypeScript types into `types/database.ts`. No app code changes yet.
3. **Auth swap** — rip Better Auth + `@convex-dev/better-auth`; rewire sign-in / sign-up / sign-out via `@supabase/ssr`; configure Google provider in Supabase dashboard; replace `lib/auth-client.ts` and `lib/auth-server.ts`; update middleware. App boots, auth works, data layer still Convex.
4. **Data layer port** — for each `convex/*.ts` file, write the equivalent Supabase server helper (RLS-aware client). Migrate API routes (`app/api/*`) call sites first since they're easier than React components.
5. **React hooks** — build a TanStack Query-backed hooks layer (`hooks/use-events.ts`, etc.) that mirrors the old Convex hooks shape. Swap call sites component-by-component.
6. **Realtime** — wire `postgres_changes` subscriptions into the hook layer so the cache invalidates on inserts/updates/deletes for the user's rows. Full parity with current behaviour.
7. **Cleanup** — delete `convex/`, remove `convex` + `@convex-dev/better-auth` from `package.json`, drop Convex env vars from docs, update `AGENTS.md` + `README.md` to say Supabase.

## Risks & open questions

- **Better Auth → Supabase Auth UX gap.** Better Auth's session model and the existing sign-in pages may not map 1:1. Phase 3 may need to rewrite `app/auth/*` pages, not just rewire them.
- **Google Calendar tokens.** Currently in `convex.users` columns. With Supabase Auth + Google provider, the provider tokens land on `auth.users.identities`. We may still need to store long-lived refresh tokens server-side (in `nozero.profiles`) because Supabase only exposes the provider token at sign-in.
- **Shared Supabase project.** `nopilot` org owns it. Other tenants may add tables to `public` — keeping nozero in its own schema is sufficient isolation, but document the schema reservation.
- **MCP access.** The Supabase MCP server's OAuth grant doesn't cover the org that owns `hzzojgkumgqzurjtnaud`, so DDL goes through the `supabase` CLI / `psql` via `SUPABASE_DB_URL`, not via `apply_migration`.
- **Realtime cost.** Full-parity subscriptions on `events` per user can be chatty if a user has many events. May revisit filter granularity post-migration.
- **Migration data movement.** Out of scope: no production users in Convex yet (open-source repo, no prod deploy under nozero brand). If that changes, add Phase 4.5 to move data.

## Exit criteria

- `bun dev` boots clean, no Convex env required.
- Sign in via Google, create an event, see it via Realtime in a second tab, accept an invitation.
- `convex/` deleted; no `convex` / `@convex-dev/*` deps in `package.json`.
- `bun run lint` clean.
