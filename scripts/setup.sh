#!/usr/bin/env bash
#
# Interactive first-run setup wizard - `bun run setup`.
#
# Walks a new contributor through generating a working `.env` (based on
# `.env.example` at the repo root), verifies the Discord bot token against
# Discord's API, and optionally brings up the Postgres/Redis services
# from `docker-compose.yml`. Safe to re-run - it never overwrites an existing
# `.env` without asking first.
#
# See scripts/README.md for the conventions other scripts/ tools follow.

set -euo pipefail

RED=$'\x1b[31m'
GREEN=$'\x1b[32m'
YELLOW=$'\x1b[33m'
DIM=$'\x1b[2m'
BOLD=$'\x1b[1m'
RESET=$'\x1b[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_EXAMPLE="${ROOT_DIR}/.env.example"
ENV_FILE="${ROOT_DIR}/.env"

cd "${ROOT_DIR}"

info()  { printf '%s\n' "${DIM}→${RESET} $*"; }
ok()    { printf '%s\n' "${GREEN}✓${RESET} $*"; }
warn()  { printf '%s\n' "${YELLOW}⚠${RESET} $*"; }
err()   { printf '%s\n' "${RED}✗${RESET} $*" >&2; }
header(){ printf '\n%s\n' "${BOLD}$*${RESET}"; }

# prompt NAME DEFAULT "Prompt text" [secret]
# Sets the global var PROMPT_RESULT.
prompt() {
  local default="$1" text="$2" secret="${3:-}" input=""
  local suffix=""
  [[ -n "$default" ]] && suffix=" ${DIM}[${default}]${RESET}"

  if [[ "$secret" == "secret" ]]; then
    read -r -s -p "$(printf '%s%s: ' "$text" "$suffix")" input
    printf '\n'
  else
    read -r -p "$(printf '%s%s: ' "$text" "$suffix")" input
  fi

  PROMPT_RESULT="${input:-$default}"
}

# confirm "question" [default: y|n]
confirm() {
  local text="$1" default="${2:-y}" reply=""
  local hint="y/N"
  [[ "$default" == "y" ]] && hint="Y/n"
  read -r -p "$(printf '%s [%s]: ' "$text" "$hint")" reply
  reply="${reply:-$default}"
  [[ "$reply" =~ ^[Yy] ]]
}

header "Lumi setup wizard"
info "This generates ${BOLD}.env${RESET} from ${BOLD}.env.example${RESET}, verifies your bot token, and can start the local Postgres/Redis stack."

if [[ ! -f "$ENV_EXAMPLE" ]]; then
  err ".env.example not found at repo root (${ENV_EXAMPLE}) - can't continue."
  exit 1
fi

if [[ -f "$ENV_FILE" ]]; then
  warn "${ENV_FILE} already exists."
  if ! confirm "Overwrite it?" "n"; then
    info "Keeping the existing .env. Re-run 'bun run setup' any time to regenerate it."
    exit 0
  fi
fi

declare -A ENV_VALUES

# ── [ 1 ] Mandatory configuration ─────────────────────────────────────────────
header "[1/4] Mandatory configuration"

prompt "" "Discord bot token ${DIM}(Bot tab, Discord Developer Portal)${RESET}" secret
BOT_TOKEN="$PROMPT_RESULT"
while [[ -z "$BOT_TOKEN" ]]; do
  warn "A bot token is required to run Lumi."
  prompt "" "Discord bot token" secret
  BOT_TOKEN="$PROMPT_RESULT"
done
ENV_VALUES[BOT_TOKEN]="$BOT_TOKEN"

prompt "" "Discord application (client) ID"
while [[ -z "$PROMPT_RESULT" ]]; do
  warn "A client ID is required."
  prompt "" "Discord application (client) ID"
done
ENV_VALUES[CLIENT_ID]="$PROMPT_RESULT"

prompt "lumi" "Postgres password"
ENV_VALUES[POSTGRES_PASSWORD]="$PROMPT_RESULT"
PG_PASSWORD="$PROMPT_RESULT"
ENV_VALUES[POSTGRES_URL]="postgresql://lumi:${PG_PASSWORD}@localhost:5432/lumi"
ENV_VALUES[DIRECT_POSTGRES_URL]="postgresql://lumi:${PG_PASSWORD}@localhost:5432/lumi"
ENV_VALUES[POSTGRES_POOL_MAX]="10"

prompt "lumi" "Redis password"
ENV_VALUES[REDIS_PASSWORD]="$PROMPT_RESULT"
ENV_VALUES[REDIS_URL]="redis://localhost:6379"
ENV_VALUES[REDIS_HOST]="localhost"
ENV_VALUES[REDIS_PORT]="6379"
ENV_VALUES[REDIS_CACHE_DB]="0"
ENV_VALUES[REDIS_TASK_DB]="1"

ENV_VALUES[RPC_HTTP_HOST]="0.0.0.0"
ENV_VALUES[RPC_HTTP_PORT]="8091"
ENV_VALUES[RPC_HTTP_URL]="http://localhost:8091"

# ── [ 2 ] General settings ────────────────────────────────────────────────────
header "[2/4] General settings"

prompt "" "Bot owner Discord user ID(s), comma-separated ${DIM}(optional)${RESET}"
ENV_VALUES[OWNER_IDS]="$PROMPT_RESULT"

prompt "," "Prefix-command trigger"
ENV_VALUES[DEFAULT_PREFIX]="$PROMPT_RESULT"

prompt "development" "NODE_ENV"
ENV_VALUES[NODE_ENV]="$PROMPT_RESULT"

ENV_VALUES[LUMI_CACHE_TTL]="60"
ENV_VALUES[LOG_LEVEL]="info"
ENV_VALUES[LOG_FORMAT]="pretty"
ENV_VALUES[SERVICE_VERSION]="0.0.0"
ENV_VALUES[OTEL_ENABLED]="false"
ENV_VALUES[OTEL_EXPORTER_OTLP_ENDPOINT]="http://otel-collector:4318"
ENV_VALUES[OTEL_TRACES_SAMPLE_RATIO]="1"
ENV_VALUES[METRICS_ENABLED]="true"
ENV_VALUES[METRICS_PORT]="9090"
ENV_VALUES[GRAFANA_USER]="admin"
ENV_VALUES[GRAFANA_PASSWORD]="admin"
ENV_VALUES[EVENT_STREAM_MAXLEN]="100000"
ENV_VALUES[EVENT_STREAM_MAX_DELIVERIES]="5"
ENV_VALUES[EVENT_STREAM_CLAIM_MIN_IDLE_MS]="60000"
ENV_VALUES[EVENT_STREAM_ACK_WAIT_MS]="60000"
ENV_VALUES[EVENT_STREAM_CLAIM_INTERVAL_MS]="30000"
ENV_VALUES[EVENT_STREAM_STATS_INTERVAL_MS]="10000"
ENV_VALUES[LUMI_ROLE]="worker"

# ── [ 3 ] Dashboard (optional) ────────────────────────────────────────────────
header "[3/4] Dashboard (optional)"

if confirm "Configure the web dashboard now?" "n"; then
  prompt "8080" "Dashboard port"
  ENV_VALUES[DASHBOARD_PORT]="$PROMPT_RESULT"
  ENV_VALUES[DASHBOARD_HOST]="0.0.0.0"

  if command -v openssl >/dev/null 2>&1; then
    GENERATED_SECRET="$(openssl rand -hex 32)"
    if confirm "Auto-generate DASHBOARD_SESSION_SECRET with openssl?" "y"; then
      ENV_VALUES[DASHBOARD_SESSION_SECRET]="$GENERATED_SECRET"
    else
      prompt "$GENERATED_SECRET" "Session secret"
      ENV_VALUES[DASHBOARD_SESSION_SECRET]="$PROMPT_RESULT"
    fi
  else
    warn "openssl not found - enter a session secret manually."
    prompt "" "Session secret" secret
    ENV_VALUES[DASHBOARD_SESSION_SECRET]="$PROMPT_RESULT"
  fi

  prompt "" "Discord OAuth2 client ID ${DIM}(OAuth2 tab, Developer Portal)${RESET}"
  ENV_VALUES[DISCORD_OAUTH2_CLIENT_ID]="$PROMPT_RESULT"
  prompt "" "Discord OAuth2 client secret" secret
  ENV_VALUES[DISCORD_OAUTH2_CLIENT_SECRET]="$PROMPT_RESULT"
  info "Add this redirect URI on the Developer Portal's OAuth2 tab:"
  info "  http://localhost:${ENV_VALUES[DASHBOARD_PORT]}/api/auth/callback/discord"
else
  info "Skipping - uncomment the '[ 5 ] DASHBOARD CONFIGURATION' block in .env later if you need it."
fi

# ── Write .env ─────────────────────────────────────────────────────────────
header "Writing ${ENV_FILE}"

{
  echo "# Generated by scripts/setup.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "# Full reference: docs/configuration.md"
  echo
  for key in "${!ENV_VALUES[@]}"; do
    printf '%s=%s\n' "$key" "${ENV_VALUES[$key]}"
  done | sort
} > "$ENV_FILE"

chmod 600 "$ENV_FILE"
ok "Wrote $(wc -l < "$ENV_FILE" | tr -d ' ') variables to .env (permissions set to 600)."

# ── [ 4 ] Verify the bot token ────────────────────────────────────────────────
header "[4/4] Verifying bot token"

if ! command -v curl >/dev/null 2>&1; then
  warn "curl not found - skipping live token verification."
else
  HTTP_STATUS=$(curl -s -o /tmp/lumi-setup-discord-me.json -w '%{http_code}' \
    -H "Authorization: Bot ${BOT_TOKEN}" \
    "https://discord.com/api/v10/users/@me" || true)

  if [[ "$HTTP_STATUS" == "200" ]]; then
    BOT_USERNAME=$(grep -o '"username":"[^"]*"' /tmp/lumi-setup-discord-me.json | head -1 | cut -d'"' -f4)
    BOT_ID=$(grep -o '"id":"[^"]*"' /tmp/lumi-setup-discord-me.json | head -1 | cut -d'"' -f4)
    ok "Token verified - logged in as ${BOLD}${BOT_USERNAME}${RESET} (${BOT_ID})."
  elif [[ "$HTTP_STATUS" == "401" ]]; then
    err "Discord rejected the token (401 Unauthorized). Double-check it in the Bot tab of the Developer Portal."
    warn "Continuing anyway - fix BOT_TOKEN in .env before starting the bot."
  else
    warn "Could not verify the token (HTTP ${HTTP_STATUS:-unknown}, or no network access). Continuing anyway."
  fi
  rm -f /tmp/lumi-setup-discord-me.json
fi

# ── Docker Compose ────────────────────────────────────────────────────────────
header "Local services"

if ! command -v docker >/dev/null 2>&1; then
  warn "docker not found - skipping. Install Docker to run Postgres/Redis locally, or point .env at existing instances."
elif ! docker compose version >/dev/null 2>&1; then
  warn "'docker compose' not available - skipping."
else
  if confirm "Start Postgres, pgbouncer, and Redis now (docker compose up -d)?" "y"; then
    info "Running: docker compose up -d postgres pgbouncer redis"
    docker compose up -d postgres pgbouncer redis
    ok "Services starting in the background - 'docker compose ps' to check status."
  else
    info "Skipped. Run it yourself later with:"
    info "  docker compose up -d postgres pgbouncer redis"
  fi
fi

# ── Next steps ─────────────────────────────────────────────────────────────
header "Next steps"
cat <<EOF
  1. bun install
  2. bun run db:migrate   ${DIM}# applies prisma/schema.prisma to Postgres${RESET}
  3. bun run dev          ${DIM}# starts worker (+ scheduler/dashboard via turbo)${RESET}

See docs/GUIDE_SELF_HOSTING.md for the full walkthrough, or docs/configuration.md
for every environment variable this project understands.
EOF
ok "Setup complete."
