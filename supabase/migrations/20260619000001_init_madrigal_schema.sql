-- madrigal schema: id_map (the cross-system join) + events (state-transition log).
-- Server-only: written by the nozero service role (the pipeline), not end users.
-- Idempotent: safe to re-apply. NOTE: add `madrigal` to the project's PostgREST
-- exposed schemas (same as `nozero`) so the service-role client can reach it.

create schema if not exists madrigal;

grant usage on schema madrigal to service_role;
grant all on all tables in schema madrigal to service_role;
grant all on all sequences in schema madrigal to service_role;

-- updated_at trigger function (schema-local).
create or replace function madrigal.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- id_map: one row per role; the backbone of the board <-> Twenty <-> context mirror.
create table if not exists madrigal.id_map (
  role_uid text primary key,
  title text,
  company_slug text,
  state text not null default 'to-do',
  fit_score int,
  github_issue text,
  flightdeck_item text,
  twenty_opportunity text,
  twenty_company text,
  twenty_people jsonb not null default '[]'::jsonb,
  context_path text,
  company_path text,
  docket_gallery_code text,
  docket_assets jsonb not null default '[]'::jsonb,
  gmail_thread text,
  calendar_events jsonb not null default '[]'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists id_map_state_idx on madrigal.id_map(state);
create index if not exists id_map_company_idx on madrigal.id_map(company_slug);

drop trigger if exists id_map_updated_at on madrigal.id_map;
create trigger id_map_updated_at before update on madrigal.id_map
  for each row execute function madrigal.set_updated_at();

-- events: append-only state-transition log (the Activepieces envelope, persisted).
create table if not exists madrigal.events (
  id uuid primary key default gen_random_uuid(),
  role_uid text not null references madrigal.id_map(role_uid) on delete cascade,
  from_state text,
  to_state text not null,
  actor text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists events_role_uid_idx on madrigal.events(role_uid);
create index if not exists events_created_idx on madrigal.events(created_at);

-- RLS: deny anon/authenticated entirely; the service role (the pipeline) bypasses RLS.
alter table madrigal.id_map enable row level security;
alter table madrigal.events enable row level security;
revoke all on madrigal.id_map from anon, authenticated;
revoke all on madrigal.events from anon, authenticated;

-- Grant the service role the now-created tables/sequences. The earlier
-- "on all tables" grant only covers tables that existed at that point, so the
-- tables created above need their own grant (run after creation).
grant select, insert, update, delete on all tables in schema madrigal to service_role;
grant usage, select on all sequences in schema madrigal to service_role;

-- NOTE: exposing `madrigal` to PostgREST is DB-specific (the schema list differs
-- per project) and is therefore NOT done here. Per project, run once:
--   alter role authenticator set pgrst.db_schemas = '<existing>, madrigal';
--   notify pgrst, 'reload config';
