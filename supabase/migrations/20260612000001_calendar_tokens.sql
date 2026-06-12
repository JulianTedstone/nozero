-- calendar_tokens: stores OAuth tokens for additional connected Google accounts.
-- The primary account's tokens remain in profiles (managed by Supabase Auth).
-- This table is for accounts added via the custom /api/auth/google/connect flow.

create table if not exists nozero.calendar_tokens (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  email       text        not null,
  access_token  text      not null,
  refresh_token text,
  token_expiry  timestamptz,
  scope         text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  unique(user_id, email)
);

alter table nozero.calendar_tokens enable row level security;

-- Users can read their own tokens (client-side token presence checks).
-- Writes always go through service-role in API routes.
create policy "Users can read own calendar_tokens"
  on nozero.calendar_tokens for select
  using (auth.uid() = user_id);
