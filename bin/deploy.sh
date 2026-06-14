#!/usr/bin/env bash
set -euo pipefail
export DEPLOY_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export DEPLOY_SYSTEMD_UNIT=aqua-nozero
export DEPLOY_ENV_TPLS=".env.tpl .env.aqua.tpl"
export DEPLOY_BUILD_CMD='bun run build'
export DEPLOY_BUN_ENV_FILES=".env.local .env.aqua.local"

LIB="${AQUA_DEPLOY_LIB:-}"
if [[ -z "$LIB" ]]; then
  _d="$DEPLOY_ROOT"
  while [[ "$_d" != "/" ]]; do
    if [[ -f "$_d/deploy/lib/host-deploy.sh" ]]; then
      LIB="$_d/deploy/lib/host-deploy.sh"
      break
    fi
    _d="$(dirname "$_d")"
  done
fi
[[ -n "$LIB" && -f "$LIB" ]] || LIB=/root/npt-core/deploy/lib/host-deploy.sh

# shellcheck source=../../deploy/lib/host-deploy.sh
source "$LIB"
aqua_deploy_run
