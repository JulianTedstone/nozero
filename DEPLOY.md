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
   # main now carries the full Supabase migration + Hetzner deploy stack
   # Inject from 1Password (nopilot.nozero + nopilot.tower vaults):
   op inject -i .env.tpl -o .env
   # Then set production site URLs if not already in your template:
   # SITE_URL=https://zero.nopilot.co
   # NEXT_PUBLIC_SITE_URL=https://zero.nopilot.co
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

## Deploy on push (GitHub Actions)

Pushes to `main` run CI (`bun install`, `bun run build`) then deploy to the Hetzner host over SSH
(`.github/workflows/deploy.yml`). Manual redeploy: **Actions → ci-deploy → Run workflow**.

Repository secrets (same pattern as `nopilot-co-www`):

| Secret | Example |
|--------|---------|
| `HETZNER_HOST` | Host IP or DNS |
| `HETZNER_USER` | `root` |
| `HETZNER_SSH_KEY` | Private key for SSH deploy |
| `DEPLOY_PATH` | `/opt/nozero` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (CI build) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (CI build) |

Optional repository variable: `NEXT_PUBLIC_SITE_URL` (defaults to `https://zero.nopilot.co`).

The host `.env` is **not** in git — it stays on the box for runtime secrets. Only
`NEXT_PUBLIC_*` values must be present for CI builds and Docker build args.

## Notes
- The build needs `NEXT_PUBLIC_*` at build time (inlined into the client bundle) —
  `docker-compose.host.yml` passes them as build args from `.env`.
- The standalone `server.js` runs under Node in the runner stage even though the build
  uses Bun; both are fine.
