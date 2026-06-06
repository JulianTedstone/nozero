-- nozero schema: profiles, events, categories, invitations.
-- RLS via auth.uid(). Realtime publication populated at the end.
-- Idempotent: safe to re-apply on a fresh project; not a downgrade.

create schema if not exists nozero;

grant usage on schema nozero to anon, authenticated, service_role;

-- updated_at trigger function (schema-local).
create or replace function nozero.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- profiles ---------------------------------------------------------------
create table if not exists nozero.profiles (
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

drop trigger if exists profiles_updated_at on nozero.profiles;
create trigger profiles_updated_at before update on nozero.profiles
  for each row execute function nozero.set_updated_at();

-- events -----------------------------------------------------------------
create table if not exists nozero.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  source text,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, event_id)
);

create index if not exists events_user_id_idx on nozero.events(user_id);
create index if not exists events_user_time_idx on nozero.events(user_id, start_at);

drop trigger if exists events_updated_at on nozero.events;
create trigger events_updated_at before update on nozero.events
  for each row execute function nozero.set_updated_at();

-- categories -------------------------------------------------------------
create table if not exists nozero.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category_id)
);

create index if not exists categories_user_id_idx on nozero.categories(user_id);

drop trigger if exists categories_updated_at on nozero.categories;
create trigger categories_updated_at before update on nozero.categories
  for each row execute function nozero.set_updated_at();

-- invitations ------------------------------------------------------------
create table if not exists nozero.invitations (
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
  status text not null check (status in ('pending','accepted','declined','tentative')),
  responded_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists invitations_event_id_idx on nozero.invitations(event_id);
create index if not exists invitations_invitee_email_idx on nozero.invitations(invitee_email);
create unique index if not exists invitations_event_invitee_uidx
  on nozero.invitations(event_id, invitee_email);

-- RLS --------------------------------------------------------------------
alter table nozero.profiles enable row level security;
alter table nozero.events enable row level security;
alter table nozero.categories enable row level security;
alter table nozero.invitations enable row level security;

-- profiles: own row only. OAuth tokens column-level revoked from anon/authenticated.
drop policy if exists profiles_self on nozero.profiles;
create policy profiles_self on nozero.profiles for all
  using (id = auth.uid()) with check (id = auth.uid());

revoke select (access_token, refresh_token, google_watch_token) on nozero.profiles from anon, authenticated;
grant select on nozero.profiles to anon, authenticated;
grant insert, update, delete on nozero.profiles to authenticated;

-- events: own rows.
drop policy if exists events_self on nozero.events;
create policy events_self on nozero.events for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on nozero.events to authenticated;

-- categories: own rows.
drop policy if exists categories_self on nozero.categories;
create policy categories_self on nozero.categories for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on nozero.categories to authenticated;

-- invitations: organizer full access; invitee read-by-email + status update.
drop policy if exists invitations_organizer on nozero.invitations;
create policy invitations_organizer on nozero.invitations for all
  using (organizer_user_id = auth.uid()) with check (organizer_user_id = auth.uid());

drop policy if exists invitations_invitee_select on nozero.invitations;
create policy invitations_invitee_select on nozero.invitations for select
  using (invitee_email = (auth.jwt() ->> 'email'));

drop policy if exists invitations_invitee_respond on nozero.invitations;
create policy invitations_invitee_respond on nozero.invitations for update
  using (invitee_email = (auth.jwt() ->> 'email'))
  with check (invitee_email = (auth.jwt() ->> 'email'));

grant select, insert, update, delete on nozero.invitations to authenticated;

-- Public-by-token read (invite landing page, no auth required).
-- Exposed via a SECURITY DEFINER RPC so we don't open the whole table to anon.
create or replace function nozero.invitation_by_token(p_token text)
returns table (
  token text, event_id text, organizer_name text, organizer_email text,
  invitee_email text, event_title text, event_start timestamptz,
  event_end timestamptz, event_location text, status text
)
language sql
security definer
set search_path = nozero, public
as $$
  select token, event_id, organizer_name, organizer_email, invitee_email,
         event_title, event_start, event_end, event_location, status
  from nozero.invitations
  where token = p_token
  limit 1;
$$;

grant execute on function nozero.invitation_by_token(text) to anon, authenticated;

-- Realtime publication ---------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    create publication supabase_realtime;
  end if;
end;
$$;

alter publication supabase_realtime add table nozero.profiles;
alter publication supabase_realtime add table nozero.events;
alter publication supabase_realtime add table nozero.categories;
alter publication supabase_realtime add table nozero.invitations;
