# `@lumi/dashboard` (`apps/dashboard`)

<div align="center">
  <img src="https://img.shields.io/badge/Role-Web%20Dashboard-blue?style=for-the-badge" alt="Role">
  <img src="https://img.shields.io/badge/Transport-RabbitMQ%20RPC-orange?style=for-the-badge" alt="Transport">
  <img src="https://img.shields.io/badge/Stateless-Yes-brightgreen?style=for-the-badge" alt="Stateless">
</div>

> Browser-based administrative web panel for Lumi-TS providing Discord OAuth2 authentication and dynamic guild configuration over RabbitMQ RPC.

---

## 📦 Role & Overview

`apps/dashboard` is the internet-facing web application of the Lumi-TS ecosystem. It allows server administrators to manage feature modules, set channel mappings, and adjust configuration fields via a web UI without issuing Discord slash commands.

### Key Responsibilities
- **Discord OAuth2 Login**: Authenticates users and filters the server list to only those where the user possesses **Manage Server** or **Administrator** permissions.
- **Auto-Generated Config Forms**: Queries module schemas dynamically via RPC (`guild.dashboard.get`), rendering form fields derived from `@sapphire/shapeshift` schemas.
- **Stateless Architecture**: Operates without a direct database or Redis connection. All reads and writes are proxied to worker processes over RabbitMQ RPC.
- **Security Isolation**: Keeps web-facing traffic entirely isolated from the process holding the Discord bot token and database credentials.

---

## 🏛️ Monorepo Architecture Position

```
Browser (Admin) ──HTTP/OAuth2──▶ apps/dashboard ──RabbitMQ RPC──▶ apps/worker (DashboardModule) ──▶ PostgreSQL
```

`apps/dashboard` imports `@lumi/contracts` for wire RPC schemas (`RPC_ACTIONS`). It never imports `@lumi/core` or touches Prisma directly.

---

## ⚙️ Environment Variables

| Variable | Description | Required / Default | Notes |
|---|---|---|---|
| `RABBITMQ_URL` | RabbitMQ URI for RPC communication | ✅ **Required** | Must match worker broker |
| `DISCORD_OAUTH2_CLIENT_ID` | Discord OAuth2 Client ID | ✅ **Required** | From Developer Portal |
| `DISCORD_OAUTH2_CLIENT_SECRET` | Discord OAuth2 Client Secret | ✅ **Required** | From Developer Portal |
| `DISCORD_OAUTH2_REDIRECT_URI` | OAuth2 callback URL | ✅ **Required** | e.g. `https://dash.example.com/callback` |
| `DASHBOARD_SESSION_SECRET` | Secret key for signed cookies | ✅ **Required** | Generate via `openssl rand -hex 32` |
| `DASHBOARD_HOST` | HTTP listen address | `0.0.0.0` | Host binding |
| `DASHBOARD_PORT` | HTTP listen port | `8080` | Service port |
| `DASHBOARD_SECURE_COOKIES` | Enforce HTTPS secure cookies | `false` | Set `true` behind reverse proxy |
| `METRICS_PORT` | Prometheus metrics port | `9090` | Serves `/healthz`, `/readyz`, `/metrics` |

---

## 💻 Usage & Execution Snippet

```bash
# Local development (Worker + RabbitMQ must be running)
bun apps/dashboard/src/main.ts

# Docker Compose execution
docker compose --profile dashboard up -d
```

### Reverse Proxy Configuration (Nginx / Caddy)

```caddy
dash.example.com {
    reverse_proxy localhost:8080
}
```
