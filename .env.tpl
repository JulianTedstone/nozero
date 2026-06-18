# nozero environment template — resolve with: op inject -i .env.tpl -o .env.local
# Item IDs are stable references; field labels match process.env names.

# Supabase (browser + server)
NEXT_PUBLIC_SUPABASE_URL=op://nopilot.nozero/tq7kbbrpezxxfz4hioheselqa4/NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=op://nopilot.nozero/i5kbur6kvb3lcpusmuazzai7im/NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=op://nopilot.nozero/vufadhupgpe6m2ihhezo3o2wdm/SUPABASE_SERVICE_ROLE_KEY

# Site URLs (override for local dev)
SITE_URL=http://localhost:3000
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# Session + Google OAuth (linked-account connect flow)
NOZERO_SESSION_SECRET=op://nopilot.nozero/pkp7cojblupjcprt7z224i7hsy/NOZERO_SESSION_SECRET
GOOGLE_CLIENT_ID=op://nopilot.nozero/nopilot.nozero.GOOGLE_CLIENT_ID/GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET=op://nopilot.nozero/nopilot.nozero.GOOGLE_CLIENT_SECRET/GOOGLE_CLIENT_SECRET

# AI — 1min.ai is nozero's LLM provider (digest, summaries, meeting brief, chat agent)
NOZERO_ONEMINAI_API_KEY=op://nopilot.nozero/nopilot.nozero.ONEMINAI_API_KEY/NOZERO_ONEMINAI_API_KEY
# NOZERO_ONEMIN_MODEL=gpt-4o-mini   # optional override (default: gpt-4o-mini)

# Soma (email threads, contacts, meeting context) — canonical: nopilot.nozero.SOMA_ACCESS
NOZERO_SOMA_ANANSI_URL=op://nopilot.nozero/izytzzjl3indhcnyp4ektrb6sq/NOZERO_SOMA_ANANSI_URL
NOZERO_SOMA_ANANSI_SECRET_API_KEY=op://nopilot.nozero/izytzzjl3indhcnyp4ektrb6sq/NOZERO_SOMA_ANANSI_SECRET_API_KEY
# NOZERO_SOMA_ACCOUNT / NOZERO_SOMA_ADMIN_USER also on SOMA_ACCESS if needed later

# Invite + reply email (MXroute SMTP API)
MXROUTE_SMTP_SERVER=op://nopilot.nozero/uxt2gafuyb7uysv2vvbmbzlug4/MXROUTE_SMTP_SERVER
MXROUTE_SMTP_USERNAME=op://nopilot.nozero/zril5wrv2i5vs5wxoci5rjcs4q/MXROUTE_SMTP_USERNAME
MXROUTE_SMTP_PASSWORD=op://nopilot.nozero/nokysphoowrw424qwyxnq22zea/MXROUTE_SMTP_PASSWORD
MXROUTE_FROM_EMAIL=op://nopilot.nozero/qckfs6ox44azlwkeq7cm5ou4hy/MXROUTE_FROM_EMAIL

# Flightdeck board (read) + Tower gateway (mutations / context)
GITHUB_TOKEN=op://nopilot.nozero/xlwfy6vzyi7ynqvlxabyb2adh4/credential
FLIGHTDECK_PROJECT_OWNER=op://nopilot.tower/7gdzwf4jgjfpulxxkkmesjzvuy/FLIGHTDECK_PROJECT_OWNER
FLIGHTDECK_PROJECT_NUMBER=op://nopilot.tower/7gdzwf4jgjfpulxxkkmesjzvuy/FLIGHTDECK_PROJECT_NUMBER
NOZERO_TOWER_API_KEY=op://nopilot.nozero/zdiflkmk2wpbsykx3bumfbfgyu/NOZERO_TOWER_API_KEY

# Krisp MCP (OAuth — per-user tokens stored in DB after connect)
KRISP_MCP_URL=op://nopilot.nozero/ihs3cc6wsiqdzqaexoe7ap2xai/KRISP_MCP_URL
KRISP_MCP_CLIENT_ID=op://nopilot.nozero/ihs3cc6wsiqdzqaexoe7ap2xai/KRISP_MCP_CLIENT_ID
KRISP_MCP_CLIENT_SECRET=op://nopilot.nozero/ihs3cc6wsiqdzqaexoe7ap2xai/KRISP_MCP_CLIENT_SECRET
KRISP_OAUTH_AUTHORIZE_URL=op://nopilot.nozero/ihs3cc6wsiqdzqaexoe7ap2xai/KRISP_OAUTH_AUTHORIZE_URL
KRISP_OAUTH_TOKEN_URL=op://nopilot.nozero/ihs3cc6wsiqdzqaexoe7ap2xai/KRISP_OAUTH_TOKEN_URL
KRISP_MCP_REDIRECT_URI=op://nopilot.nozero/ihs3cc6wsiqdzqaexoe7ap2xai/KRISP_MCP_REDIRECT_URI
# Local dev: register each dev port you use in the Krisp app (redirect follows the browser host):
# http://localhost:3000/api/accounts/krisp/callback
# http://localhost:3001/api/accounts/krisp/callback

# Ctx / gbrain MCP gateway — per-actor bearer tokens (Tower pattern)
# Service principal for nozero server: nopilot.agents.GBRAIN_CTX_TOKEN / nozero
# Agents (pierre, bertrand, …): same item, field = actor id — see AGENTS.md
NOZERO_CTX_GATEWAY_URL=op://nopilot.nozero/2lib2rrsj7ex4ruqq47vx7tsam/NOZERO_CTX_GATEWAY_URL
NOZERO_CTX_API_KEY=op://nopilot.agents/iju5zrdkpmqz7y3yqp37d7zc54/nozero

# Dev only — Postgres direct connection for migrations / types:gen (not injected; build at runtime)
# Project ref from nopilot.nozero.NEXT_PUBLIC_SUPABASE_URL; DB user/pass from nopilot.nozero.supabase.ACCESS
#   eval "$(bash scripts/supabase-db-url.sh --export)"
#   psql "$SUPABASE_DB_URL" -f supabase/migrations/….sql
#   bun run types:gen
