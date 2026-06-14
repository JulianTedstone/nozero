# Nozero on Aqua

Fresh clone from `~/Projects/npt/nozero` (committed `main` at clone time).

## Aqua wiring

1. Base secrets: `op inject -i .env.tpl -o .env.local` (upstream nozero template)
2. Aqua overlay: `op inject -i .env.aqua.tpl -o .env.aqua.local`
3. Dev: `op run --env-file=.env.local --env-file=.env.aqua.local -- bun run dev --port 3001`

Supabase points at **gily**. CRM paths must migrate to `HYDRATION_API_URL` — direct Soma CRM calls are transitional debt.

## Catch-up from npt/nozero

The source repo has uncommitted WIP. To refresh this copy:

```bash
cd ~/Projects/npt/nozero && git stash  # or commit first
cd ~/Projects/aqua/nozero && git pull /Users/ted/Projects/npt/nozero main
```
