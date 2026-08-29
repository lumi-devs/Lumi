---
title: "Self-Hosting Guide"
description: "Get Lumi running on your own machine or server."
category: "Getting Started"
---

# Self-Hosting Guide

This walks through running Lumi for yourself - a personal server, a small community, or a custom deployment. If you outgrow a single instance later (thousands of members, multiple bot processes, zero-downtime deploys), see [Production Deployment](/Lumi/guides/production-deployment/) once you've got the basics working.

## What you'll need

| Requirement | Details |
| :--- | :--- |
| **[Bun](https://bun.sh)** | `1.3.0+` required for local execution. |
| **[Docker](https://docs.docker.com/get-docker/) & Docker Compose** | The recommended way to run Postgres and Redis. |
| **Discord Application** | Create one at the [Developer Portal](https://discord.com/developers/applications) with bot token and client ID. |

---

## 1. Create a Discord Application

1. Open the [Discord Developer Portal](https://discord.com/developers/applications) → **New Application**.
2. Go to the **Bot** tab → click **Reset Token**, and copy your `BOT_TOKEN`.
3. Under **Privileged Gateway Intents**, enable **Server Members Intent** and **Message Content Intent**.
4. Go to **OAuth2 → General**, copy your `CLIENT_ID`.
5. Under **OAuth2 → URL Generator**: check `bot` and `applications.commands`, select your guild permissions, and open the generated link to invite Lumi to your server.

---

## 2. Clone and Configure

```bash
git clone https://github.com/lumi-devs/Lumi.git
cd Lumi
bun run setup
```

`bun run setup` runs an interactive terminal wizard that configures `.env`, verifies your bot token with Discord's API, and spins up local Docker dependencies.

### Manual Configuration

If you prefer configuring by hand:

```bash
cp .env.example .env
```

Set the essential environment variables in `.env`:

| Variable | Description |
| :--- | :--- |
| `BOT_TOKEN` | Discord Bot Token from Step 1. |
| `CLIENT_ID` | Discord Application Client ID from Step 1. |
| `POSTGRES_PASSWORD` | Database password (default is fine for local dev). |
| `POSTGRES_URL` | PostgreSQL connection URI (`postgresql://postgres:postgres@localhost:5432/lumi`). |
| `DIRECT_POSTGRES_URL` | Unpooled connection URI for migrations. |
| `REDIS_PASSWORD` | Redis auth password. |
| `REDIS_URL` | Redis connection URI (`redis://localhost:6379`). |

---

## 3. Start Postgres and Redis

### Option A: Docker Compose (Recommended)

```bash
docker compose up -d postgres pgbouncer redis
docker compose ps
```

### Option B: Nix Devshell

```bash
nix develop
```

Starts native PostgreSQL and Redis instances locally via the multi-platform Nix flake.

### Option C: External / Cloud Databases

Point `POSTGRES_URL` and `REDIS_URL` in `.env` to your hosted Postgres 17+ and Redis 7+ instances.

---

## 4. Initialize Database Schema

```bash
bun install
bun run db:generate   # Generates Prisma client
bun run db:migrate    # Applies schema migrations
```

---

## 5. Start the Bot Worker

### Development Mode (Hot-Reload)

```bash
bun run dev
```

### Production Worker

```bash
bun run start
```

### Docker Container

```bash
docker compose up -d worker
docker compose logs -f worker
```

---

## 6. Start the Web Admin Dashboard (Optional)

Lumi includes a Next.js administrative dashboard:

```bash
bun run --cwd apps/dashboard dev
```

Access the dashboard at `http://localhost:3000`. The dashboard communicates with the worker over an internal HTTP RPC bridge on port `3001`.
