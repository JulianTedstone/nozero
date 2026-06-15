#!/usr/bin/env bash
# Build SUPABASE_DB_URL for aqua-npt (gily) from 1Password aqua.npt vault.
set -euo pipefail

OP_VAULT="aqua.npt"
OP_ITEM="t2unligxzny6hwkxmehua3lneu"

public_url="https://gilyyzjsasyhrwterjor.supabase.co"
db_user="postgres"
db_pass="$(op read "op://${OP_VAULT}/${OP_ITEM}/SUPABASE_DB_PASSWORD")"

ref="${public_url#https://}"
ref="${ref%%.supabase.co*}"

encoded_pass="$(python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$db_pass")"
url="postgres://${db_user}:${encoded_pass}@db.${ref}.supabase.co:5432/postgres"

if [[ "${1:-}" == "--export" ]]; then
  printf 'export SUPABASE_DB_URL=%q\n' "$url"
else
  printf '%s\n' "$url"
fi
