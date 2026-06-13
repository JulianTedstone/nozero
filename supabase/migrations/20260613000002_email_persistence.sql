-- Email thread/message persistence with AI summaries (archive-only lifecycle on threads).

create table if not exists nozero.email_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  external_id text not null,
  account_email text not null,
  subject text not null default '(No subject)',
  sender_email text,
  ai_summary text,
  thread_intent text,
  participants jsonb not null default '[]'::jsonb,
  is_unread boolean not null default true,
  is_archived boolean not null default false,
  is_tracking boolean not null default false,
  streams jsonb not null default '[]'::jsonb,
  message_count int not null default 0,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, external_id, account_email)
);

create index if not exists email_threads_user_list_idx
  on nozero.email_threads (user_id, is_archived, last_message_at desc nulls last);

create index if not exists email_threads_user_unread_idx
  on nozero.email_threads (user_id, is_unread)
  where is_archived = false;

create table if not exists nozero.email_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  external_id text not null,
  thread_external_id text not null,
  account_email text,
  from_email text,
  to_emails jsonb not null default '[]'::jsonb,
  cc_emails jsonb not null default '[]'::jsonb,
  subject text,
  body_plain text not null default '',
  body_original text,
  ai_summary jsonb,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, external_id)
);

create index if not exists email_messages_thread_idx
  on nozero.email_messages (user_id, thread_external_id, sent_at);

drop trigger if exists email_threads_updated_at on nozero.email_threads;
create trigger email_threads_updated_at before update on nozero.email_threads
  for each row execute function nozero.set_updated_at();

alter table nozero.email_threads enable row level security;
alter table nozero.email_messages enable row level security;

drop policy if exists email_threads_self on nozero.email_threads;
create policy email_threads_self on nozero.email_threads for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists email_messages_self on nozero.email_messages;
create policy email_messages_self on nozero.email_messages for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update on nozero.email_threads to authenticated;
grant select, insert, update on nozero.email_messages to authenticated;

grant all on nozero.email_threads to service_role;
grant all on nozero.email_messages to service_role;

alter publication supabase_realtime add table nozero.email_threads;
