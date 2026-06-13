-- Ensure service_role can access new tables (matches init schema default grants).

grant all on nozero.account_codes to service_role;
grant all on nozero.email_threads to service_role;
grant all on nozero.email_messages to service_role;
