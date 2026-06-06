# Deploying nozero (Hetzner + host Caddy)

nozero is a standalone Next.js server (`output: 'standalone'`) in Docker, served at
`https://zero.nopilot.co`. It runs on the shared nopilot Hetzner box ("jupiter")
behind the **host-level Caddy** (a separate compose project) that owns `:80`/`:443`
and already fronts the other nopilot services. nozero ships no Caddy of its own — it
just attaches `nozero-web` to that Caddy's Docker network. Same pattern as
`nopilot-co-www`.

## One-time host setup
1. Clone on the host and create `.env` (only the nozero app keys — NOT the shared
   multi-project secrets file):
   ```bash
   git clone https://github.com/JulianTedstone/nozero.git
   cd nozero
   git checkout feat/2-phase6-supabase-realtime   # until the migration stack merges to main
   $EDITOR .env
   ```
   `.env` needs:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   SUPABASE_SERVICE_ROLE_KEY=
   SITE_URL=https://zero.nopilot.co
   NEXT_PUBLIC_SITE_URL=https://zero.nopilot.co
   OPENROUTER_API_KEY=
   OPENROUTER_MODEL=x-ai/grok-4.1-fast
   # Invite emails via MXroute SMTP API — app boots without these; only needed to send
   MXROUTE_SMTP_SERVER=chocobo.mxrouting.net
   MXROUTE_SMTP_USERNAME=     # full mailbox address used to authenticate
   MXROUTE_SMTP_PASSWORD=
   MXROUTE_FROM_EMAIL=julian@nopilot.co
   ```
2. Build + run, attached to the host Caddy network:
   ```bash
   docker compose -f docker-compose.host.yml up -d --build
   ```
3. Add a site block to the host Caddy config and reload it:
   ```
   zero.nopilot.co {
     encode gzip zstd
     reverse_proxy nozero-web:3000
   }
   ```
4. **TLS / Cloudflare:** `zero.nopilot.co` is proxied (orange cloud). Either grey-cloud
   it so Caddy can complete ACME, or rely on the Cloudflare Origin certificate the other
   `*.nopilot.co` hosts use (a wildcard origin cert covers `zero` automatically). A 525
   means Caddy presented no cert Cloudflare accepted for this SNI.
5. Verify: `curl -I https://zero.nopilot.co` → 200.

## Notes
- The build needs `NEXT_PUBLIC_*` at build time (inlined into the client bundle) —
  `docker-compose.host.yml` passes them as build args from `.env`.
- The standalone `server.js` runs under Node in the runner stage even though the build
  uses Bun; both are fine.
