---
title: "Self-Hosting Guide"
description: "Deploy Lumi in under 5 minutes using official Docker Compose containers or run from source."
category: "Getting Started"
---

The easiest way to run Lumi in production is with **Docker Compose**. The pre-configured stack sets up the bot worker, web dashboard, PostgreSQL database, PgBouncer pooler, and Redis cache automatically.

---

## Prerequisites

Before starting, make sure you have:

1. A Linux server or desktop with **Docker** and **Docker Compose** installed.
2. A **Discord Bot Account** created in the [Discord Developer Portal](https://discord.com/developers/applications).

---

## Step 1: Create Your Discord Bot

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) and click **New Application**.
2. Go to the **Bot** tab:
   - Click **Reset Token** and copy the token (this is your `BOT_TOKEN`).
   - Under **Privileged Gateway Intents**, turn on:
     - **Server Members Intent** (required for member logging and verification)
     - **Message Content Intent** (required for prefix commands)
3. Go to the **OAuth2** tab:
   - Copy your **Client ID** (this is your `CLIENT_ID`).
4. Generate an invite link:
   - Go to **OAuth2 → URL Generator**.
   - Select scopes: `bot` and `applications.commands`.
   - Select permissions: `Administrator` (or your desired permissions).
   - Open the generated link in your browser to invite the bot to your server.

---

## Step 2: Download Configuration Files

Create a directory on your server and download the official configuration files:

```bash
mkdir lumi && cd lumi

# Download the production Docker Compose stack
curl -fsSL https://raw.githubusercontent.com/lumi-devs/Lumi/main/docker-compose.yml -o docker-compose.yml

# Download the environment template
curl -fsSL https://raw.githubusercontent.com/lumi-devs/Lumi/main/.env.example -o .env
```

---

## Step 3: Configure Environment (`.env`)

Open `.env` in your text editor:

```bash
nano .env
```

Fill in the essential variables:

```bash
# Your Discord credentials
BOT_TOKEN=paste_your_bot_token_here
CLIENT_ID=paste_your_client_id_here

# Generate random 32-byte hex secrets (run: openssl rand -hex 32)
RPC_INTERNAL_TOKEN=generate_and_paste_secret_here
APPEAL_TOKEN_SECRET=generate_and_paste_secret_here

# Database passwords (choose strong passwords)
POSTGRES_PASSWORD=choose_a_strong_database_password
REDIS_PASSWORD=choose_a_strong_redis_password
```

---

## Step 4: Launch the Stack

Start all containers in the background:

```bash
docker compose up -d
```

Verify that all services are running:

```bash
docker compose ps
```

You should see five active containers:
- `lumi-worker`: The bot process connected to Discord.
- `lumi-dashboard`: The Next.js web console on port `8080`.
- `lumi-postgres`: PostgreSQL database.
- `lumi-pgbouncer`: Connection pooler.
- `lumi-redis`: Cache and event bus.

---

## Step 5: Verify Your Bot in Discord

1. Check your bot's status in Discord. It should appear online.
2. In any channel where the bot has access, type:
   ```
   /lumi panel
   ```
3. Lumi responds with the interactive server configuration panel. You're ready to go!

---

## Managing Your Bot

### Viewing Logs
```bash
# View real-time logs from the bot
docker compose logs -f worker

# View web dashboard logs
docker compose logs -f dashboard
```

### Updating to the Latest Version
```bash
docker compose pull
docker compose up -d
```

### Restarting the Bot
```bash
docker compose restart worker
```
