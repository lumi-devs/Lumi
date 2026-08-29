---
title: "Self-Hosting Guide"
description: "Deploy Lumi using official pre-built Docker containers or run locally with Bun."
category: "Getting Started"
---

# Self-Hosting Guide

The **recommended and supported method** to run Lumi in production is using the official pre-built **Docker Compose** stack published to GitHub Container Registry (`ghcr.io/lumi-devs/lumi:latest`). 

If you are developing custom addons or hacking on the core framework, see the [Local Development Workflow](#method-b-local-development-with-bun-and-nix) below.

---

## Prerequisites

| Requirement | Notes |
| :--- | :--- |
| **[Docker](https://docs.docker.com/get-docker/) & Docker Compose v2+** | **Recommended.** Runs Lumi worker, dashboard, PostgreSQL, PgBouncer, and Redis with zero local dependencies. |
| **Discord Application** | Create one at the [Discord Developer Portal](https://discord.com/developers/applications) with your bot token and client ID. |
| **[Bun](https://bun.sh) `1.3.0+`** | *Only required for local development or manual source builds.* |

---

## Step 1: Create a Discord Application & Bot

1. Navigate to the [Discord Developer Portal](https://discord.com/developers/applications) → **New Application**.
2. Go to the **Bot** tab → click **Reset Token**, and copy your `BOT_TOKEN`.
3. Under **Privileged Gateway Intents**, turn on:
   - **Server Members Intent** (required for moderation and member tracking)
   - **Message Content Intent** (required for prefix commands)
4. Go to **OAuth2 → General**, and copy your **Client ID** (`CLIENT_ID`).
5. Go to **OAuth2 → URL Generator**:
   - Scopes: Select `bot` and `applications.commands`.
   - Permissions: Select `Administrator` (or desired permissions).
   - Open the generated URL in your browser to invite the bot to your Discord server.

---

## Method A: Docker Compose (Recommended for Production)

Docker Compose deploys the entire Lumi stack using pre-built multi-architecture containers from `ghcr.io/lumi-devs/lumi:latest`.

### 1. Download Compose Configuration

```bash
mkdir lumi && cd lumi
curl -fsSL https://raw.githubusercontent.com/lumi-devs/Lumi/main/docker-compose.yml -o docker-compose.yml
curl -fsSL https://raw.githubusercontent.com/lumi-devs/Lumi/main/.env.example -o .env
```

### 2. Configure Environment (`.env`)

Edit `.env` and fill in your Discord credentials and an RPC security secret:

```bash
# Required Discord Credentials
BOT_TOKEN=your_discord_bot_token_here
CLIENT_ID=your_discord_client_id_here

# Generate a secure 32-byte RPC secret for Dashboard <-> Worker communication
RPC_INTERNAL_TOKEN=$(openssl rand -hex 32)

# Passwords for internal Postgres & Redis services
POSTGRES_PASSWORD=lumi_secure_pg_password
REDIS_PASSWORD=lumi_secure_redis_password
```

### 3. Launch the Stack

```bash
docker compose up -d
```

### 4. Verify Service Health

```bash
docker compose ps
```

The stack automatically boots:
- **`worker`**: Discord Gateway client and module executor.
- **`dashboard`**: Next.js 16 Web Admin panel accessible at `http://localhost:8080`.
- **`postgres` & `pgbouncer`**: Relational database and connection pool.
- **`redis`**: Cache and Redis Streams event bus.
- **`prometheus` & `grafana`**: Telemetry and metrics dashboard at `http://localhost:3000`.

To view live bot logs:

```bash
docker compose logs -f worker
```

---

## Method B: Local Development with Bun and Nix

For addon developers, framework contributors, or advanced users who prefer compiling from source:

### 1. Clone the Monorepo

```bash
git clone https://github.com/lumi-devs/Lumi.git
cd Lumi
```

### 2. Run the Interactive Setup Wizard

```bash
bun run setup
```

The setup wizard (`scripts/setup.sh`):
1. Prompts for `BOT_TOKEN`, `CLIENT_ID`, and database passwords.
2. Validates your token directly against Discord's Gateway API.
3. Automatically links shared `.env` files across monorepo workspace packages.
4. Generates a secure `RPC_INTERNAL_TOKEN`.

### 3. Start Local Infrastructure

```bash
# Option 1: Docker for Postgres and Redis only
docker compose up -d postgres pgbouncer redis

# Option 2: Nix multi-platform devshell (no Docker needed)
nix develop
```

### 4. Initialize Database Schema

```bash
bun install
bun run db:generate   # Generates Prisma client
bun run db:migrate    # Runs database migrations
```

### 5. Start in Development Mode (Hot-Reload)

```bash
# Start the bot worker with file watching
bun run dev

# Start the web dashboard (in another terminal)
bun run --cwd apps/dashboard dev
```

---

## Post-Installation Verification

1. In Discord, type `/` in a channel where Lumi is present to confirm slash commands are registered.
2. Open `http://localhost:8080` (or `http://localhost:3000` for dev) to access the administrative dashboard.
3. Test a built-in command such as `/help` or `/afk`.
