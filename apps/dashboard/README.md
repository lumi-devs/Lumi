# 🖥️ @lumi/dashboard

<div align="center">
  <img src="https://img.shields.io/badge/Status-Production_Ready-brightgreen?style=for-the-badge" alt="Status">
  <img src="https://img.shields.io/badge/Bun-1.3+-black?style=for-the-badge&logo=bun" alt="Bun">
  <img src="https://img.shields.io/badge/TypeScript-5.9-blue?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Port-8080-orange?style=for-the-badge" alt="Port">
  <img src="https://img.shields.io/badge/Auth-Discord_OAuth2-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord OAuth2">
</div>

<br />

The **Lumi Dashboard** (`@lumi/dashboard`) is a lightweight, stateless web administration panel built on **Bun.serve**. It empowers Discord server administrators to manage Lumi bot features, toggle modules, and modify configuration settings directly from a browser UI without using Discord chat commands.

---

## 📖 Table of Contents

- [Overview](#-overview)
- [Architecture & Data Flow](#-architecture--data-flow)
- [Configuration & Environment Variables](#-configuration--environment-variables)
- [Development & Running Instructions](#-development--running-instructions)
- [API & HTTP Endpoints](#-api--http-endpoints)

---

## 🌟 Overview

The dashboard operates as an internet-facing frontend that is completely decoupled from Discord bot credentials and primary database storage:

- **Discord OAuth2 Authentication**: Authenticates users and automatically filters accessible guilds where the user holds `MANAGE_GUILD` (Manage Server) permissions.
- **Dynamic Form Generation**: Reads schema definitions directly from the live bot feature registry via RabbitMQ RPC (`guild.dashboard.get`). Newly installed bot modules appear in the web UI automatically.
- **Instant Persistence**: Setting toggles and input fields auto-save immediately on change; no manual "Save" button is required.
- **Stateless Architecture**: Maintains zero internal database or Redis dependencies. Sessions are kept in memory using HMAC-signed cookies, keeping the security surface minimal.

> [!NOTE]
> The dashboard process does not store the Discord Bot Token (`BOT_TOKEN`) or access PostgreSQL directly. All configuration reads and updates are securely proxied over RabbitMQ RPC to active bot worker nodes.

---

## 🏗️ Architecture & Data Flow

### Request Flow Diagram

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Server Administrator
    participant Dash as apps/dashboard (Bun.serve)
    participant RMQ as RabbitMQ (RPC Exchange)
    participant Worker as apps/worker (DashboardModule)
    participant DB as PostgreSQL 17

    Admin->>Dash: Access /guild/:guildId
    Dash->>Dash: Validate Session & Cookie HMAC
    Dash->>RMQ: RPC Call: guild.dashboard.get { guildId, actorId }
    RMQ->>Worker: Dispatch RPC Payload
    Worker->>DB: Fetch Guild Settings & Module Schema
    DB-->>Worker: Return Guild Config Data
    Worker-->>RMQ: Return Dashboard State
    RMQ-->>Dash: Resolve RPC Promise
    Dash-->>Admin: Render Server Configuration UI

    Admin->>Dash: Toggle Module / Edit Field (POST /api/guild/:id/*)
    Dash->>Dash: Validate Same-Origin & Session Auth
    Dash->>RMQ: RPC Call: guild.module.toggle / guild.config.set
    RMQ->>Worker: Dispatch Configuration Update
    Worker->>DB: Persist Settings in DB
    Worker-->>RMQ: RPC Acknowledge (ok: true)
    RMQ-->>Dash: Resolve API Request
    Dash-->>Admin: Return HTTP 200 { ok: true }
```

---

## ⚙️ Configuration & Environment Variables

Configure `@lumi/dashboard` using environment variables. Required variables must be set before launching the process.

| Environment Variable | Required | Default | Description |
|---|:---:|:---:|---|
| `DASHBOARD_HOST` | No | `0.0.0.0` | IP interface host address for the web server. |
| `DASHBOARD_PORT` | No | `8080` | Network port for HTTP web requests. |
| `DASHBOARD_SESSION_SECRET` | **Yes** | - | HMAC signing key for secure session cookies. Generate with `openssl rand -hex 32`. |
| `DASHBOARD_SECURE_COOKIES` | No | `false` | Enables `Secure` flag on cookies. Set to `true` when deployed behind HTTPS. |
| `DISCORD_OAUTH2_CLIENT_ID` | **Yes** | - | Discord Application Client ID from the Discord Developer Portal. |
| `DISCORD_OAUTH2_CLIENT_SECRET` | **Yes** | - | Discord Application Client Secret. |
| `DISCORD_OAUTH2_REDIRECT_URI` | **Yes** | - | Fully qualified OAuth2 callback URL (e.g. `https://dash.example.com/callback`). |
| `RABBITMQ_URL` | **Yes** | - | Connection string for RabbitMQ broker (e.g. `amqp://lumi:lumi@localhost:5672`). |
| `METRICS_ENABLED` | No | `true` | Enables HTTP metrics and readiness endpoint server. |
| `METRICS_PORT` | No | `9090` | Network port for Prometheus metrics and health checks. |
| `LOG_LEVEL` | No | `info` | Logging verbosity (`debug` \| `info` \| `warn` \| `error`). |
| `LOG_FORMAT` | No | `json` | Log output format (`json` \| `pretty`). |

> [!TIP]
> Generate a strong `DASHBOARD_SESSION_SECRET` in your terminal:
> ```bash
> openssl rand -hex 32
> ```

---

## 🚀 Development & Running Instructions

### Local Development

Ensure RabbitMQ and at least one worker process are running before launching the dashboard:

```bash
# Clone and install workspace dependencies
bun install

# Run the dashboard in development mode
bun apps/dashboard/src/main.ts
```

### Docker Compose

Launch the dashboard alongside the default Lumi infrastructure:

```bash
docker compose --profile dashboard up -d
```

### Discord Developer Portal Setup

1. Open the [Discord Developer Portal](https://discord.com/developers/applications) and select your application.
2. Navigate to **OAuth2** -> **General**.
3. Under **Redirects**, add your callback URL matching `DISCORD_OAUTH2_REDIRECT_URI` (e.g., `http://localhost:8080/callback` or `https://dash.example.com/callback`).
4. Copy the **Client ID** and **Client Secret** into your `.env` configuration file.

### Reverse Proxy Configuration (Nginx / Caddy)

For production deployments behind a reverse proxy, terminate TLS at the proxy and set `DASHBOARD_SECURE_COOKIES=true`.

#### Caddyfile Example

```caddy
dash.example.com {
    reverse_proxy localhost:8080
}
```

#### Nginx Configuration Snippet

```nginx
server {
    server_name dash.example.com;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

---

## 📡 API & HTTP Endpoints

### User Web Interface Routes

| HTTP Method | Route | Authentication | Description |
|---|---|:---:|---|
| `GET` | `/` | Optional | Displays the Server Selection (Picker) page if logged in, or the Login page if unauthenticated. |
| `GET` | `/login` | Public | Initiates the Discord OAuth2 authorization flow and sets a state cookie. |
| `GET` | `/callback` | Public | Handles OAuth2 code exchange, creates an encrypted session, and redirects to `/`. |
| `GET` | `/logout` | Session | Destroys the current user session and clears authentication cookies. |
| `GET` | `/guild/:guildId` | Session + Guild Admin | Renders the server module configuration page via RabbitMQ RPC. |

### REST API Routes

All POST endpoints require valid session authentication and same-origin CSRF validation.

| HTTP Method | Route | Payload | Description |
|---|---|---|---|
| `POST` | `/api/guild/:guildId/module` | `{"moduleName": "mod", "enabled": true}` | Toggles a specific module state for the guild via RPC (`guild.module.toggle`). |
| `POST` | `/api/guild/:guildId/config` | `{"moduleName": "mod", "key": "logChannelId", "value": "12345"}` | Updates a module setting key/value pair via RPC (`guild.config.set`). |

### Observability & Health Endpoints

Served on `METRICS_PORT` (default `9090`):

| Route | Method | Description |
|---|---|---|
| `/healthz` | `GET` | Returns HTTP 200 when the HTTP process is healthy. |
| `/readyz` | `GET` | Returns HTTP 200 when the RabbitMQ RPC connection is active. |
| `/metrics` | `GET` | Exports Prometheus formatted runtime and RPC metrics. |
