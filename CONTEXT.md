# CONTEXT.md

**Current Task:** zero.nopilot.co production login and Jupiter unattended deploy secrets — fixed; document and land deploy scaffold in aqua monorepo.

**Key Decisions**
- Root cause of "Invalid email or password" was unresolved `op://` in the Next.js client bundle, not Google OAuth conflict.
- Jupiter uses `OP_SERVICE_ACCOUNT_TOKEN` in `/root/npt-core/.env.op` for deploy-time `op inject`; never `op signin` on the host.
- `DEFAUL_SUPER_ADMIN*` is ops/1Password parity only — app does not auto-provision admin users.

**Next Steps**
- Commit `~/aqua/deploy` changes (`host-deploy.sh`, `README.md`, `systemd/op.conf`) from the aqua monorepo.
- Add repo migration for gily PostgREST `nozero` schema exposure (currently ad-hoc SQL on gily).
- Fix Jupiter `op signin` on deploy path: ensure GitHub Actions SSH deploy uses updated `host-deploy.sh` (already synced to `/root/npt-core/deploy/`).
