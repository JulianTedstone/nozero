-- Account codes for time-sheeting: scoped per connected email account.
-- Archive-only lifecycle — rows are never hard-deleted.

create table if not exists nozero.account_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_email text not null,
  code text not null,
  label text not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, account_email, code)
);

create index if not exists account_codes_user_account_idx
  on nozero.account_codes (user_id, account_email);

create index if not exists account_codes_active_idx
  on nozero.account_codes (user_id, account_email)
  where archived_at is null;

drop trigger if exists account_codes_updated_at on nozero.account_codes;
create trigger account_codes_updated_at before update on nozero.account_codes
  for each row execute function nozero.set_updated_at();

alter table nozero.account_codes enable row level security;

drop policy if exists account_codes_select on nozero.account_codes;
create policy account_codes_select on nozero.account_codes
  for select using (user_id = auth.uid());

drop policy if exists account_codes_insert on nozero.account_codes;
create policy account_codes_insert on nozero.account_codes
  for insert with check (user_id = auth.uid());

drop policy if exists account_codes_update on nozero.account_codes;
create policy account_codes_update on nozero.account_codes
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update on nozero.account_codes to authenticated;

grant all on nozero.account_codes to service_role;

alter publication supabase_realtime add table nozero.account_codes;
