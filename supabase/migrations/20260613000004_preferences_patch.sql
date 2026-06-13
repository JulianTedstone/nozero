-- Atomic JSONB preference updates to avoid lost-update races between
-- connectedAccounts, connectedCalDav, connectedTokens, etc.

create or replace function nozero.patch_profile_preferences(
  p_user_id uuid,
  p_patch jsonb
)
returns void
language sql
security definer
set search_path = nozero, public
as $$
  update nozero.profiles
  set
    preferences = coalesce(preferences, '{}'::jsonb) || p_patch,
    updated_at = now()
  where id = p_user_id;
$$;

create or replace function nozero.set_caldav_credential(
  p_user_id uuid,
  p_email text,
  p_creds jsonb
)
returns void
language sql
security definer
set search_path = nozero, public
as $$
  update nozero.profiles
  set
    preferences = jsonb_set(
      coalesce(preferences, '{}'::jsonb),
      '{connectedCalDav}',
      coalesce(preferences->'connectedCalDav', '{}'::jsonb)
        || jsonb_build_object(p_email, p_creds),
      true
    ),
    updated_at = now()
  where id = p_user_id;
$$;

create or replace function nozero.remove_caldav_credential(
  p_user_id uuid,
  p_email text
)
returns void
language sql
security definer
set search_path = nozero, public
as $$
  update nozero.profiles
  set
    preferences = case
      when preferences ? 'connectedCalDav'
        and (preferences->'connectedCalDav') ? p_email
      then jsonb_set(
        preferences,
        '{connectedCalDav}',
        (preferences->'connectedCalDav') - p_email,
        true
      )
      else preferences
    end,
    updated_at = now()
  where id = p_user_id;
$$;

grant execute on function nozero.patch_profile_preferences(uuid, jsonb) to service_role;
grant execute on function nozero.set_caldav_credential(uuid, text, jsonb) to service_role;
grant execute on function nozero.remove_caldav_credential(uuid, text) to service_role;
