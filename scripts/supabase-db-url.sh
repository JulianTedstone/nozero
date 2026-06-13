#!/usr/bin/env bash
# Build SUPABASE_DB_URL from 1Password:
#   nopilot.nozero.NEXT_PUBLIC_SUPABASE_URL  → project ref (e.g. goakrbhmcyswvuakhedn)
#   nopilot.nozero.supabase.ACCESS           → SUPABASE_DB_USERNAME / SUPABASE_DB_PASSWORD
set -euo pipefail

OP_VAULT="nopilot.nozero"
OP_URL_ITEM="liphtm63il4dg6bkpgy5vhqgr4"
OP_ACCESS_ITEM="ur7yvv42e3bodaa6cjxxw25teq"

public_url="$(op read "op://${OP_VAULT}/${OP_URL_ITEM}/NEXT_PUBLIC_SUPABASE_URL")"
db_user="$(op read "op://${OP_VAULT}/${OP_ACCESS_ITEM}/SUPABASE_DB_USERNAME")"
db_pass="$(op read "op://${OP_VAULT}/${OP_ACCESS_ITEM}/SUPABASE_DB_PASSWORD")"

ref="${public_url#https://}"
ref="${ref%%.supabase.co*}"

encoded_pass="$(python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$db_pass")"
url="postgres://${db_user}:${encoded_pass}@db.${ref}.supabase.co:5432/postgres"

if [[ "${1:-}" == "--export" ]]; then
  printf 'export SUPABASE_DB_URL=%q\n' "$url"
else
  printf '%s\n' "$url"
fi
