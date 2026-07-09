# @lumi/dashboard

Browser-based admin panel for Lumi. Log in with Discord, pick a server, and
configure any module — the same settings surfaced by `/lumi`, in a web UI with
no commands required.

## What it does

- **Discord OAuth2 login** — only surfaces servers where you have **Manage
  Server**.
- **Auto-generated config forms** — every module's fields are rendered from the
  live feature registry (`guild.dashboard.get`), so new modules appear
  automatically with no dashboard changes.
- **Auto-save** — toggles and fields persist on change; no Save button.
- **Stateless** — it holds no database or Redis of its own. All reads and writes
  go to the bot workers over the existing **RabbitMQ RPC bridge**
  (`guild.dashboard.get` / `guild.module.toggle` / `guild.config.set`). Sessions
  live in memory; a restart just asks admins to log in again.

## Architecture

```
browser ──HTTP──▶ apps/dashboard ──RabbitMQ RPC──▶ worker (DashboardModule) ──▶ DB
```

The dashboard never imports `@lumi/core` or touches Discord/Postgres directly —
it only speaks the `@lumi/contracts` RPC actions. This keeps the public,
internet-facing surface isolated from the process that holds the bot token.

## Configuration

| Variable | Required | Default | Notes |
|---|---|---|---|
| `RABBITMQ_URL` | ✅ | — | Same broker the workers use. |
| `DISCORD_OAUTH2_CLIENT_ID` | ✅ | — | From your Discord app → OAuth2. |
| `DISCORD_OAUTH2_CLIENT_SECRET` | ✅ | — | |
| `DISCORD_OAUTH2_REDIRECT_URI` | ✅ | — | Must match a registered redirect, e.g. `https://dash.example.com/callback`. |
| `DASHBOARD_SESSION_SECRET` | ✅ | — | HMAC key for signed cookies. `openssl rand -hex 32`. |
| `DASHBOARD_HOST` | | `0.0.0.0` | |
| `DASHBOARD_PORT` | | `8080` | |
| `DASHBOARD_SECURE_COOKIES` | | `false` | Set `true` behind HTTPS. |

Health and metrics are served on `METRICS_PORT` (default `9090`) — `/healthz`,
`/readyz` (reports the RabbitMQ connection), and `/metrics`.

## Running

```bash
# Local dev (workers + RabbitMQ already up)
bun apps/dashboard/src/main.ts

# Docker — starts the dashboard alongside the default services
docker compose --profile dashboard up
```

### Discord OAuth2 setup

1. https://discord.com/developers/applications → your app → **OAuth2** →
   **Redirects** → add your `DISCORD_OAUTH2_REDIRECT_URI`.
2. Copy the **Client ID** and **Client Secret** into the env vars above.

### Behind a reverse proxy (recommended for production)

Terminate TLS at nginx/Caddy and set `DASHBOARD_SECURE_COOKIES=true`.

```
dash.example.com {
    reverse_proxy localhost:8080
}
```
